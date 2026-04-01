const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Firebase Admin SDK setup
const admin = require('firebase-admin');

// Check if running with service account file or env vars
if (process.env.FIREBASE_PRIVATE_KEY) {
  // Using environment variables
  admin.initializeApp({
    credential: admin.credential.cert({
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
    })
  });
} else {
  // Using service account JSON file (create this from Firebase Console)
  try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (e) {
    console.error('Firebase service account not configured. Please set up .env or serviceAccountKey.json');
    process.exit(1);
  }
}

const db = admin.firestore();

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Subscribe - Add email
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    
    // Check if email already exists
    const snapshot = await db.collection('emails')
      .where('email', '==', email.toLowerCase().trim())
      .get();
    
    if (!snapshot.empty) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    // Add to Firestore
    const docRef = await db.collection('emails').add({
      email: email.toLowerCase().trim(),
      date: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ 
      success: true, 
      message: 'Subscribed successfully',
      id: docRef.id 
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all emails (for admin)
app.get('/api/emails', async (req, res) => {
  try {
    const snapshot = await db.collection('emails')
      .orderBy('date', 'desc')
      .get();
    
    const emails = [];
    snapshot.forEach(doc => {
      emails.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.json({ emails });
  } catch (error) {
    console.error('Get emails error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete single email
app.delete('/api/emails/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('emails').doc(id).delete();
    res.json({ success: true, message: 'Email deleted' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete all emails
app.delete('/api/emails', async (req, res) => {
  try {
    const snapshot = await db.collection('emails').get();
    const batch = db.batch();
    
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    res.json({ success: true, message: 'All emails deleted' });
  } catch (error) {
    console.error('Clear all error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin login (simple password check)
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true, token: 'admin-session' });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API endpoints:`);
  console.log(`  POST /api/subscribe - Subscribe email`);
  console.log(`  GET  /api/emails - Get all emails`);
  console.log(`  DELETE /api/emails/:id - Delete email`);
  console.log(`  DELETE /api/emails - Clear all emails`);
});

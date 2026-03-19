// Temporary auth system for testing
// Run this on Railway to add auth tables and create test user

const express = require('express');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());

// Temporary registration endpoint
app.post('/auth/temp-register', async (req, res) => {
  try {
    const { gymName, firstName, lastName, email, password } = req.body;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // In a real setup, this would save to database
    // For now, just return success
    res.json({
      success: true,
      message: 'Account created successfully',
      user: {
        email,
        firstName,
        lastName,
        gymName
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Temporary login endpoint
app.post('/auth/temp-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // For testing, accept these credentials
    if (email === 'paul@gymiq.ai' && password === 'GymIQ2026!') {
      res.json({
        success: true,
        token: 'temp-jwt-token',
        user: {
          id: 'temp-user-id',
          email: 'paul@gymiq.ai',
          firstName: 'Paul',
          lastName: 'Airey',
          role: 'GYM_OWNER'
        }
      });
    } else {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

console.log('Temporary auth endpoints ready');
console.log('Use paul@gymiq.ai / GymIQ2026! to login');

if (require.main === module) {
  const port = process.env.PORT || 3002;
  app.listen(port, () => {
    console.log(`Temp auth server running on port ${port}`);
  });
}

module.exports = app;
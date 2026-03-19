// Temporary Vercel serverless registration endpoint
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { gymName, firstName, lastName, email, password } = req.body;

    // Basic validation
    if (!email || !password || !gymName || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // For demo purposes, accept the registration
    res.json({
      success: true,
      message: 'Account created successfully! You can now login with your credentials.',
      user: {
        email,
        firstName,
        lastName,
        gymName,
        role: 'GYM_OWNER'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
}
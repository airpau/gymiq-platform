// Temporary Vercel serverless auth endpoint
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
    const { email, password } = req.body;

    // Test credentials
    if (email === 'paul@gymiq.ai' && password === 'GymIQ2026!') {
      res.json({
        success: true,
        token: 'temp-jwt-token-' + Date.now(),
        user: {
          id: 'temp-user-id',
          email: 'paul@gymiq.ai',
          firstName: 'Paul',
          lastName: 'Airey',
          role: 'GYM_OWNER',
          gymId: 'temp-gym-id'
        }
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials. Use paul@gymiq.ai / GymIQ2026!'
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Login failed' });
  }
}
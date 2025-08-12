// auth.js
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({ 
      error: 'API key required',
      message: 'Please provide an API key in the x-api-key header or Authorization header' 
    });
  }

  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ 
      error: 'Invalid API key',
      message: 'The provided API key is not valid' 
    });
  }

  // API key is valid, proceed to next middleware
  next();
};

module.exports = authenticateApiKey;
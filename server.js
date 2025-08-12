
// Only load dotenv in development
/*if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
*/
const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

// Debug environment variables
console.log('=== ENVIRONMENT DEBUG ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('API_KEY exists:', !!process.env.API_KEY);
console.log('API_KEY value:', process.env.API_KEY ? '[HIDDEN]' : 'undefined');
console.log('All env keys:', Object.keys(process.env).filter(key => !key.startsWith('_')));
console.log('=========================');

console.log('=== ALL ENVIRONMENT VARIABLES ===');
Object.keys(process.env).sort().forEach(key => {
  if (key === 'API_KEY') {
    console.log(`${key}: [FOUND] ${process.env[key] ? 'HAS_VALUE' : 'NO_VALUE'}`);
  } else {
    console.log(`${key}: ${key.startsWith('RAILWAY') ? 'RAILWAY_VAR' : 'OTHER'}`);
  }
});
console.log('=====================================');
console.log('TEST_VAR:', process.env.TEST_VAR);

const authenticateApiKey = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database connection
const db = new Database(path.join(__dirname, 'gramgrid_puzzles.db'));

// Create analytics table on startup
const createAnalyticsTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      user_id TEXT,
      puzzle_date DATE,
      user_agent TEXT,
      ip_address TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics(DATE(timestamp));
    CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics(event_type);
    CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics(user_id);
  `);
};

createAnalyticsTable();

// Middleware
app.use(cors());
app.use(express.json());

// Prepare SQL statements for better performance
const getPuzzleByDate = db.prepare('SELECT puzzle_data FROM daily_puzzles WHERE puzzle_date = ? AND puzzle_level = ?');
const getAllPuzzles = db.prepare('SELECT puzzle_date, puzzle_data FROM daily_puzzles ORDER BY puzzle_date DESC');
const insertPuzzle = db.prepare('INSERT OR REPLACE INTO daily_puzzles (puzzle_date, puzzle_level, puzzle_data) VALUES (?, ?, ?)');
const deletePuzzle = db.prepare('DELETE FROM daily_puzzles WHERE puzzle_date = ?');

// Get week of puzzles (today + 6 previous days) for a specific level
const getWeekPuzzles = db.prepare(`
  SELECT puzzle_date, puzzle_level, puzzle_data 
  FROM daily_puzzles 
  WHERE puzzle_date >= date(?, '-6 days') AND puzzle_date <= ?
    AND puzzle_level = ?
  ORDER BY puzzle_date DESC
`);


// Analytics prepared statements
const insertAnalytics = db.prepare(`
  INSERT INTO analytics (event_type, user_id, puzzle_date, user_agent, ip_address, metadata) 
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Helper functions for analytics
const getClientIP = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         '0.0.0.0';
};

const generateUserID = (req) => {
  const ip = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';
  return crypto.createHash('md5').update(ip + userAgent).digest('hex').substring(0, 8);
};

const trackEvent = (eventType, req, puzzleDate = null, metadata = {}) => {
  try {
    insertAnalytics.run(
      eventType,
      generateUserID(req),
      puzzleDate,
      req.headers['user-agent'] || 'unknown',
      getClientIP(req),
      JSON.stringify(metadata)
    );
  } catch (error) {
    console.error('Analytics tracking error:', error);
  }
};

// Analytics middleware - track API calls
app.use((req, res, next) => {
  if (req.path.startsWith('/api/puzzle') && req.method === 'GET') {
    trackEvent('api_request', req, null, {
      method: req.method,
      path: req.path,
      query: req.query
    });
  }
  next();
});

// EXISTING ROUTES (with analytics added)
// Routes

// Public routes (no authentication required)
app.get('/', (req, res) => {
  res.json({ message: 'API is running. Authentication required for protected routes.' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});



// Health check
/*app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
*/


// Protected routes (authentication required)
app.use('/api', authenticateApiKey); // Apply auth to all /api routes


// Get puzzle by date
app.get('/api/puzzle/:date', (req, res) => {
  try {
    const { date } = req.params;
    const level = req.query.level || 'CL'; // Default to Classic
    
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    
    // Validate level
    if (!['CL', 'CH'].includes(level.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid level. Use CL (Classic) or CH (Challenge)' });
    }
    
    const result = getPuzzleByDate.get(date, level.toUpperCase());
    
    if (!result) {
      return res.status(404).json({ error: 'Puzzle not found for this date and level' });
    }
    
    const puzzleData = JSON.parse(result.puzzle_data);
    res.json({
      date,
      level: level.toUpperCase(),
      puzzle: puzzleData
    });
    
  } catch (error) {
    console.error('Error fetching puzzle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get today's puzzle
app.get('/api/puzzle/today', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const level = req.query.level || 'CL'; // Default to Classic
    
    // Validate level
    if (!['CL', 'CH'].includes(level.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid level. Use CL (Classic) or CH (Challenge)' });
    }
    
    const result = getPuzzleByDate.get(today, level.toUpperCase());
    
    if (!result) {
      return res.status(404).json({ error: `No ${level.toUpperCase()} puzzle available for today` });
    }
    
    const puzzleData = JSON.parse(result.puzzle_data);
    res.json({
      date: today,
      level: level.toUpperCase(),
      puzzle: puzzleData
    });
    
  } catch (error) {
    console.error('Error fetching today\'s puzzle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get week of puzzles (today + 6 previous days)
app.get('/api/puzzles/week', (req, res) => {
  try {
    const level = req.query.level || 'CL'; // Default to Classic
    const today = new Date().toISOString().split('T')[0];
    
    // Validate level
    if (!['CL', 'CH'].includes(level.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid level. Use CL (Classic) or CH (Challenge)' });
    }
    
    const results = getWeekPuzzles.all(today, today, level.toUpperCase());
    
    if (results.length === 0) {
      return res.status(404).json({ error: `No ${level.toUpperCase()} puzzles found for this week` });
    }
    
    const puzzles = results.map(row => ({
      date: row.puzzle_date,
      level: row.puzzle_level,
      puzzle: JSON.parse(row.puzzle_data)
    }));
    
    res.json({
      level: level.toUpperCase(),
      puzzles: puzzles,
      count: puzzles.length,
      dateRange: {
        from: puzzles[puzzles.length - 1]?.date,
        to: puzzles[0]?.date
      }
    });
    
  } catch (error) {
    console.error('Error fetching week puzzles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all puzzles (for admin/management)
app.get('/api/puzzles', (req, res) => {
  try {
    const results = getAllPuzzles.all();
    const puzzles = results.map(row => ({
      date: row.puzzle_date,
      puzzle: JSON.parse(row.puzzle_data)
    }));
    
    res.json({ puzzles });
    
  } catch (error) {
    console.error('Error fetching puzzles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add new puzzle (POST)
app.post('/api/puzzle', (req, res) => {
  try {
    const { date, level, puzzle } = req.body;
    
    if (!date || !level || !puzzle) {
      return res.status(400).json({ error: 'Date, level, and puzzle data are required' });
    }
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    
    // Validate level
    if (!['CL', 'CH'].includes(level.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid level. Use CL (Classic) or CH (Challenge)' });
    }
    
    // Validate puzzle has required fields
    if (!puzzle.words || !puzzle.targets || !puzzle.solution) {
      return res.status(400).json({ error: 'Puzzle must have words, targets, and solution' });
    }
    
    insertPuzzle.run(date, level.toUpperCase(), JSON.stringify(puzzle));
    
    res.status(201).json({ 
      message: 'Puzzle created successfully',
      date,
      level: level.toUpperCase(),
      puzzle 
    });
    
  } catch (error) {
    console.error('Error creating puzzle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete puzzle
app.delete('/api/puzzle/:date', (req, res) => {
  try {
    const { date } = req.params;
    
    const result = deletePuzzle.run(date);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }
    
    res.json({ message: 'Puzzle deleted successfully' });
    
  } catch (error) {
    console.error('Error deleting puzzle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// NEW ANALYTICS ROUTES

// Track custom events from client
app.post('/api/analytics/event', (req, res) => {
  try {
    const { eventType, puzzleDate, metadata } = req.body;
    
    if (!eventType) {
      return res.status(400).json({ error: 'eventType is required' });
    }
    
    trackEvent(eventType, req, puzzleDate || null, metadata || {});
    res.json({ success: true });
    
  } catch (error) {
    console.error('Analytics event error:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

// Get analytics dashboard data
app.get('/api/analytics/stats', (req, res) => {
  try {
    const stats = {
      // Daily unique visitors for last 30 days
      dailyVisitors: db.prepare(`
        SELECT DATE(timestamp) as date, COUNT(DISTINCT user_id) as visitors
        FROM analytics 
        WHERE timestamp >= datetime('now', '-30 days')
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
      `).all(),
      
      // Total stats
      totals: db.prepare(`
        SELECT 
          COUNT(DISTINCT user_id) as totalVisitors,
          COUNT(*) as totalEvents,
          COUNT(DISTINCT DATE(timestamp)) as activeDays
        FROM analytics
      `).get(),
      
      // Most popular puzzles
      popularPuzzles: db.prepare(`
        SELECT 
          puzzle_date, 
          COUNT(*) as accesses,
          COUNT(DISTINCT user_id) as uniqueUsers
        FROM analytics 
        WHERE event_type = 'puzzle_accessed' 
        AND puzzle_date IS NOT NULL
        GROUP BY puzzle_date
        ORDER BY accesses DESC
        LIMIT 10
      `).all(),
      
      // Event breakdown
      eventTypes: db.prepare(`
        SELECT 
          event_type, 
          COUNT(*) as count,
          COUNT(DISTINCT user_id) as uniqueUsers
        FROM analytics
        GROUP BY event_type
        ORDER BY count DESC
      `).all(),
      
      // Recent activity (last 50 events)
      recentActivity: db.prepare(`
        SELECT 
          event_type, 
          puzzle_date, 
          datetime(timestamp, 'localtime') as timestamp,
          CASE 
            WHEN metadata != '{}' THEN json_extract(metadata, '$.error') 
            ELSE NULL 
          END as error
        FROM analytics
        ORDER BY timestamp DESC
        LIMIT 50
      `).all(),
      
      // Today's stats
      today: db.prepare(`
        SELECT 
          COUNT(DISTINCT user_id) as visitors,
          COUNT(*) as events,
          COUNT(CASE WHEN event_type = 'puzzle_accessed' THEN 1 END) as puzzleViews
        FROM analytics
        WHERE DATE(timestamp) = DATE('now')
      `).get()
    };
    
    res.json(stats);
    
  } catch (error) {
    console.error('Analytics stats error:', error);
    res.status(500).json({ error: 'Failed to get analytics stats' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  db.close();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Word Puzzle API running on port ${PORT}`);
  console.log(`📖 Health check: http://localhost:${PORT}/health`);
  console.log(`🧩 Today's puzzle: http://localhost:${PORT}/api/puzzle/today?level=CL`);
  console.log(`📅 Week puzzles: http://localhost:${PORT}/api/puzzles/week?level=CL`);
  console.log(`📊 Analytics: http://localhost:${PORT}/api/analytics/stats`);
  console.log(`API Key authentication is ${process.env.API_KEY ? 'enabled' : 'disabled'}`);
  
});
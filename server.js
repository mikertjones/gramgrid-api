const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database connection
const db = new Database(path.join(__dirname, 'gramgrid_puzzles.db'));

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

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

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
});
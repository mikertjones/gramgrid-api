const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
const db = new Database(path.join(__dirname, 'gramgrid_puzzles.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_puzzles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    puzzle_date DATE UNIQUE NOT NULL,
    puzzle_level CHAR(2) NOT NULL,
    puzzle_data TEXT NOT NULL CHECK (json_valid(data)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_puzzle_date ON daily_puzzles(puzzle_date);
`);

// Insert sample puzzle data
const insertPuzzle = db.prepare(`
  INSERT OR REPLACE INTO daily_puzzles (puzzle_date, puzzle_level, puzzle_data) 
  VALUES (?, ?, ?)
`);

// Sample puzzle data
const samplePuzzles = [
  {
    date: '2025-07-27',
    data: {
      word: 'HELLO',
      difficulty: 'easy',
      clues: [
        'A greeting word',
        'What you say when answering the phone',
        'Five letters, starts with H'
      ],
      letters: ['H', 'E', 'L', 'L', 'O'],
      hints: 3,
      timeLimit: 300
    }
  },
  {
    date: '2025-07-28',
    data: {
      word: 'WORLD',
      difficulty: 'medium',
      clues: [
        'Planet Earth',
        'Global community',
        'Five letters, ends with D'
      ],
      letters: ['W', 'O', 'R', 'L', 'D'],
      hints: 2,
      timeLimit: 240
    }
  }
];

// Insert sample data
/*
console.log('Initializing database...');
samplePuzzles.forEach(puzzle => {
  try {
    insertPuzzle.run(puzzle.date, JSON.stringify(puzzle.data));
    console.log(`✓ Added puzzle for ${puzzle.date}`);
  } catch (error) {
    console.error(`✗ Error adding puzzle for ${puzzle.date}:`, error.message);
  }
});
*/
// Verify data
const count = db.prepare('SELECT COUNT(*) as count FROM daily_puzzles').get();
console.log(`\nDatabase initialized with ${count.count} puzzles`);

db.close();
console.log('Database setup complete!');
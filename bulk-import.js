const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, 'gramgrid_puzzles.db'));

// Method 1: Import from JSON array
function importFromJSON(jsonFilePath) {
  console.log('Starting JSON import...');
  
  const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
  const insertPuzzle = db.prepare('INSERT OR REPLACE INTO daily_puzzles (puzzle_date, puzzle_level, puzzle_data) VALUES (?, ?, ?)');
  
  // Use transaction for bulk insert (much faster)
  const insertMany = db.transaction((puzzles) => {

    for (const puzzle of puzzles) {
      console.log(puzzle)
      insertPuzzle.run(puzzle.date, puzzle.level, JSON.stringify(puzzle.data));
    }
  });
  
  const startTime = Date.now();
  insertMany(jsonData);
  const endTime = Date.now();
  
  console.log(`✓ Imported ${jsonData.length} puzzles in ${endTime - startTime}ms`);
}

// Method 2: Import from CSV
function importFromCSV(csvFilePath) {
  console.log('Starting CSV import...');
  
  const csvContent = fs.readFileSync(csvFilePath, 'utf8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',');
  
  const insertPuzzle = db.prepare('INSERT OR REPLACE INTO daily_puzzles (puzzle_date, puzzle_data) VALUES (?, ?)');
  
  const insertMany = db.transaction((rows) => {
    for (let i = 1; i < rows.length; i++) {
      const values = rows[i].split(',');
      const puzzleData = {};
      
      headers.forEach((header, index) => {
        const key = header.trim().replace(/"/g, '');
        let value = values[index]?.trim().replace(/"/g, '');
        
        // Try to parse JSON strings or arrays
        if (value && (value.startsWith('[') || value.startsWith('{'))) {
          try {
            value = JSON.parse(value);
          } catch (e) {
            // Keep as string if not valid JSON
          }
        }
        
        puzzleData[key] = value;
      });
      
      const date = puzzleData.date;
      delete puzzleData.date;
      
      insertPuzzle.run(date, JSON.stringify(puzzleData));
    }
  });
  
  const startTime = Date.now();
  insertMany(lines);
  const endTime = Date.now();
  
  console.log(`✓ Imported ${lines.length - 1} puzzles from CSV in ${endTime - startTime}ms`);
}

// Method 3: Generate bulk test data
function generateTestPuzzles(count = 100) {
  console.log(`Generating ${count} test puzzles...`);
  
  const words = ['HELLO', 'WORLD', 'BRAIN', 'PUZZLE', 'WORDS', 'GAMES', 'LOGIC', 'SMART', 'THINK', 'SOLVE'];
  const difficulties = ['easy', 'medium', 'hard'];
  
  const insertPuzzle = db.prepare('INSERT OR REPLACE INTO daily_puzzles (puzzle_date, puzzle_data) VALUES (?, ?)');
  
  const insertMany = db.transaction((puzzleCount) => {
    for (let i = 0; i < puzzleCount; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      const word = words[Math.floor(Math.random() * words.length)];
      const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
      
      const puzzleData = {
        word: word,
        difficulty: difficulty,
        clues: [
          `A ${difficulty} word`,
          `${word.length} letters long`,
          `Starts with ${word[0]}`
        ],
        letters: word.split(''),
        hints: Math.floor(Math.random() * 3) + 1,
        timeLimit: 300 - (difficulties.indexOf(difficulty) * 60)
      };
      
      insertPuzzle.run(dateStr, JSON.stringify(puzzleData));
    }
  });
  
  const startTime = Date.now();
  insertMany(count);
  const endTime = Date.now();
  
  console.log(`✓ Generated ${count} test puzzles in ${endTime - startTime}ms`);
}

// Method 4: Import from SQL file
function importFromSQL(sqlFilePath) {
  console.log('Starting SQL import...');
  
  const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
  
  // Split by semicolons and execute each statement
  const statements = sqlContent.split(';').filter(stmt => stmt.trim());
  
  const transaction = db.transaction(() => {
    statements.forEach(statement => {
      if (statement.trim()) {
        db.exec(statement);
      }
    });
  });
  
  const startTime = Date.now();
  transaction();
  const endTime = Date.now();
  
  console.log(`✓ Executed SQL import in ${endTime - startTime}ms`);
}

// Usage examples and CLI interface
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const filePath = args[1];
  
  try {
    switch (command) {
      case 'json':
        if (!filePath) throw new Error('Please provide JSON file path');
        importFromJSON(filePath);
        break;
        
      case 'csv':
        if (!filePath) throw new Error('Please provide CSV file path');
        importFromCSV(filePath);
        break;
        
      case 'generate':
        const count = parseInt(filePath) || 100;
        generateTestPuzzles(count);
        break;
        
      case 'sql':
        if (!filePath) throw new Error('Please provide SQL file path');
        importFromSQL(filePath);
        break;
        
      default:
        console.log(`
Usage:
  node bulk-import.js json puzzles.json
  node bulk-import.js csv puzzles.csv  
  node bulk-import.js generate 365
  node bulk-import.js sql dump.sql

Commands:
  json <file>     Import from JSON array
  csv <file>      Import from CSV file
  generate <num>  Generate test puzzles
  sql <file>      Import from SQL file
        `);
    }
    
    // Show final count
    const count = db.prepare('SELECT COUNT(*) as count FROM daily_puzzles').get();
    console.log(`\nDatabase now contains ${count.count} total puzzles`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  importFromJSON,
  importFromCSV,
  generateTestPuzzles,
  importFromSQL
};
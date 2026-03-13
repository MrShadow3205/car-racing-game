const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Fixed: matches your MongoDB Compass database name
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://Swayam320:Swayam273@swayam320.9gmj9kl.mongodb.net/racingGame?appName=Swayam320';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Score Schema
const scoreSchema = new mongoose.Schema({
  playerName: { type: String, required: true, trim: true, maxlength: 30 },
  score:      { type: Number, required: true, min: 0 },
  date:       { type: Date, default: Date.now }
});

const Score = mongoose.model('Score', scoreSchema);

// ─── Page Routes ─────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('/leaderboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')));

// ─── API Routes ──────────────────────────────────────────────

// POST /save-score
app.post('/save-score', async (req, res) => {
  try {
    const { playerName, score } = req.body;
    if (!playerName || score === undefined)
      return res.status(400).json({ error: 'playerName and score are required.' });

    const newScore = new Score({ playerName, score });
    await newScore.save();
    console.log(`💾 Saved: ${playerName} → ${score}`);
    res.status(201).json({ message: 'Score saved!', data: newScore });
  } catch (err) {
    console.error('Error saving score:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const topScores = await Score.find()
      .sort({ score: -1 })
      .limit(10)
      .select('playerName score date');
    console.log(`📊 Leaderboard fetched: ${topScores.length} entries`);
    res.json(topScores);
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚗 Game       → http://localhost:${PORT}`);
  console.log(`🏆 Leaderboard → http://localhost:${PORT}/leaderboard`);
  console.log(`🗄️  MongoDB    → ${MONGO_URI}`);
});

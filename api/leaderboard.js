const mongoose = require('mongoose');

// ─── DB Connection (reused across warm invocations) ───────────
let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  await mongoose.connect(process.env.MONGO_URI);
  isConnected = true;
}

// ─── Schema ───────────────────────────────────────────────────
const scoreSchema = new mongoose.Schema({
  playerName: { type: String, required: true, trim: true, maxlength: 30 },
  score:      { type: Number, required: true, min: 0 },
  date:       { type: Date, default: Date.now }
});

const Score = mongoose.models.Score || mongoose.model('Score', scoreSchema);

// ─── Handler ──────────────────────────────────────────────────
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();

    const topScores = await Score.find()
      .sort({ score: -1 })
      .limit(10)
      .select('playerName score date');

    return res.status(200).json(topScores);

  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();

    const { playerName, score } = req.body;

    if (!playerName || score === undefined) {
      return res.status(400).json({ error: 'playerName and score are required.' });
    }

    const newScore = new Score({ playerName, score });
    await newScore.save();

    return res.status(201).json({ message: 'Score saved!', data: newScore });

  } catch (err) {
    console.error('Error saving score:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

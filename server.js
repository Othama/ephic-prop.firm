const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const stripe = require('stripe')('YOUR_STRIPE_SECRET_KEY');

app.use(express.json());
app.use(express.static('.'));

const USERS_FILE = 'users.json';
const CHALLENGES_FILE = 'challenges.json';
const TRANSACTIONS_FILE = 'transactions.json';

let users = {};
let challenges = {};
let transactions = [];

function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE));
        }
    } catch(e) {}
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadChallenges() {
    try {
        if (fs.existsSync(CHALLENGES_FILE)) {
            challenges = JSON.parse(fs.readFileSync(CHALLENGES_FILE));
        }
    } catch(e) {}
}

function saveChallenges() {
    fs.writeFileSync(CHALLENGES_FILE, JSON.stringify(challenges, null, 2));
}

function loadTransactions() {
    try {
        if (fs.existsSync(TRANSACTIONS_FILE)) {
            transactions = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE));
        }
    } catch(e) {}
}

function saveTransactions() {
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
}

loadUsers();
loadChallenges();
loadTransactions();

// ===== ROUTES =====
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/dashboard.html');
});

// ===== REGISTER =====
app.post('/api/register', (req, res) => {
    const { username, password, email } = req.body;
    
    if (users[username]) {
        return res.json({ status: 'error', message: 'Username already exists' });
    }
    
    users[username] = {
        password: password,
        email: email,
        balance: 0,
        equity: 0,
        drawdown: 0,
        challenges: [],
        mt5_account: null,
        created: new Date().toISOString()
    };
    saveUsers();
    res.json({ status: 'success', message: 'Account created!' });
});

// ===== LOGIN =====
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!users[username] || users[username].password !== password) {
        return res.json({ status: 'error', message: 'Invalid credentials' });
    }
    
    res.json({ 
        status: 'success', 
        user: {
            username: username,
            email: users[username].email,
            balance: users[username].balance,
            challenges: users[username].challenges || []
        }
    });
});

// ===== BUY CHALLENGE (Stripe Payment) =====
app.post('/api/create-payment-intent', async (req, res) => {
    const { amount, username } = req.body;
    
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // cents
            currency: 'usd',
            metadata: { username: username, challenge: amount }
        });
        
        res.json({
            status: 'success',
            clientSecret: paymentIntent.client_secret
        });
    } catch(e) {
        res.json({ status: 'error', message: e.message });
    }
});

app.post('/api/buy', (req, res) => {
    const { username, amount, payment_intent } = req.body;
    
    if (!users[username]) {
        return res.json({ status: 'error', message: 'User not found' });
    }
    
    // Record transaction
    transactions.push({
        username: username,
        amount: amount,
        payment_intent: payment_intent,
        type: 'challenge_purchase',
        date: new Date().toISOString()
    });
    saveTransactions();
    
    // Create challenge
    const challenge = {
        id: Date.now().toString(),
        amount: amount,
        date: new Date().toISOString(),
        status: 'active',
        balance: parseFloat(amount),
        equity: parseFloat(amount),
        drawdown: 0,
        mt5_login: null
    };
    
    if (!users[username].challenges) {
        users[username].challenges = [];
    }
    users[username].challenges.push(challenge);
    users[username].balance = parseFloat(amount);
    users[username].equity = parseFloat(amount);
    saveUsers();
    
    res.json({ 
        status: 'success', 
        message: `Challenge ${amount} purchased!`,
        challenge: challenge
    });
});

// ===== MT5 INTEGRATION =====
app.post('/api/mt5/create', (req, res) => {
    const { username, challenge_id } = req.body;
    
    // Simulate MT5 account creation
    const mt5_login = 'MT5' + Date.now().toString().slice(-8);
    const mt5_password = 'P@ss' + Math.random().toString(36).substring(2, 8);
    
    const user = users[username];
    if (user) {
        const challenge = user.challenges.find(c => c.id === challenge_id);
        if (challenge) {
            challenge.mt5_login = mt5_login;
            challenge.mt5_password = mt5_password;
            challenge.mt5_server = 'MetaQuotes-Demo';
            user.mt5_account = {
                login: mt5_login,
                password: mt5_password,
                server: 'MetaQuotes-Demo'
            };
            saveUsers();
        }
    }
    
    res.json({
        status: 'success',
        mt5_login: mt5_login,
        mt5_password: mt5_password,
        mt5_server: 'MetaQuotes-Demo',
        message: 'MT5 account created!'
    });
});

app.get('/api/mt5/status/:username', (req, res) => {
    const user = users[req.params.username];
    if (!user || !user.mt5_account) {
        return res.json({ status: 'error', message: 'No MT5 account found' });
    }
    
    res.json({
        status: 'success',
        mt5_account: user.mt5_account
    });
});

// ===== PAYOUT =====
app.post('/api/payout', (req, res) => {
    const { username, amount } = req.body;
    
    if (!users[username]) {
        return res.json({ status: 'error', message: 'User not found' });
    }
    
    if (users[username].balance < amount) {
        return res.json({ status: 'error', message: 'Insufficient balance' });
    }
    
    users[username].balance -= amount;
    saveUsers();
    
    transactions.push({
        username: username,
        amount: amount,
        type: 'payout_request',
        status: 'pending',
        date: new Date().toISOString()
    });
    saveTransactions();
    
    res.json({ 
        status: 'success', 
        message: `Payout of $${amount} requested! Processing in 24-48 hours.`
    });
});

// ===== STATS =====
app.get('/api/stats', (req, res) => {
    const totalUsers = Object.keys(users).length;
    const totalChallenges = Object.values(users).reduce((sum, u) => sum + (u.challenges ? u.challenges.length : 0), 0);
    const totalPayouts = transactions.filter(t => t.type === 'payout_request' && t.status === 'completed').reduce((sum, t) => sum + t.amount, 0);
    
    res.json({
        totalUsers: totalUsers,
        totalChallenges: totalChallenges,
        totalFunded: Math.floor(totalUsers * 0.3),
        totalPayouts: totalPayouts
    });
});

app.get('/api/user/:username', (req, res) => {
    const user = users[req.params.username];
    if (!user) {
        return res.json({ status: 'error', message: 'User not found' });
    }
    res.json({
        status: 'success',
        user: {
            username: req.params.username,
            email: user.email,
            balance: user.balance,
            challenges: user.challenges || [],
            mt5_account: user.mt5_account || null
        }
    });
});

module.exports = app;

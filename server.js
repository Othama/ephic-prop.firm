const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');

app.use(express.json());
app.use(express.static('.'));

const USERS_FILE = 'users.json';
const CHALLENGES_FILE = 'challenges.json';
let users = {};
let challenges = {};

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

loadUsers();
loadChallenges();

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/dashboard.html');
});

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
        created: new Date().toISOString()
    };
    saveUsers();
    res.json({ status: 'success', message: 'Account created! Welcome to EPHIC PROP FIRM' });
});

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

app.post('/api/buy', (req, res) => {
    const { username, amount } = req.body;
    
    if (!users[username]) {
        return res.json({ status: 'error', message: 'User not found' });
    }
    
    const challenge = {
        id: Date.now().toString(),
        amount: amount,
        date: new Date().toISOString(),
        status: 'active',
        balance: parseFloat(amount),
        equity: parseFloat(amount),
        drawdown: 0
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
            challenges: user.challenges || []
        }
    });
});

app.get('/api/stats', (req, res) => {
    const totalUsers = Object.keys(users).length;
    const totalChallenges = Object.values(users).reduce((sum, u) => sum + (u.challenges ? u.challenges.length : 0), 0);
    res.json({
        totalUsers: totalUsers,
        totalChallenges: totalChallenges,
        totalFunded: Math.floor(totalUsers * 0.3)
    });
});

module.exports = app;

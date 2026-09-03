const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');

app.use(express.json());
app.use(express.static('.'));

// ===== DATA =====
const USERS_FILE = 'users.json';
let users = {};

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

loadUsers();

// ===== ROUTES =====
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
        balance: 10000,
        equity: 10000,
        drawdown: 0,
        created: new Date().toISOString()
    };
    saveUsers();
    res.json({ status: 'success', message: 'Account created!' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!users[username] || users[username].password !== password) {
        return res.json({ status: 'error', message: 'Invalid credentials' });
    }
    
    res.json({ 
        status: 'success', 
        user: users[username]
    });
});

app.get('/api/stats', (req, res) => {
    const totalUsers = Object.keys(users).length;
    res.json({
        totalUsers: totalUsers,
        totalFunded: Math.floor(totalUsers * 0.3),
        totalPayouts: Math.floor(totalUsers * 0.1 * 1000)
    });
});

module.exports = app;

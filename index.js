const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let players = [];
let gameInProgress = false;
let multiplier = 1;
let crashTimer = null;

const randomCrashPoint = () => {
  return parseFloat((1.5 + Math.random() * 8.5).toFixed(2)); // between 1.5x and 10x
};

let crashPoint = randomCrashPoint();

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("join", (username) => {
    socket.username = username;
    console.log(`${username} joined`);
    socket.emit("joined", { success: true });
  });

  socket.on("place_bet", (betAmount) => {
    if (gameInProgress) {
      players.push({
        id: socket.id,
        username: socket.username,
        bet: betAmount,
        cashedOut: false
      });
      console.log(`${socket.username} bet ${betAmount}`);
      socket.emit("bet_placed", { success: true });
    }
  });

  socket.on("cash_out", () => {
    const player = players.find(p => p.id === socket.id);
    if (player && !player.cashedOut && gameInProgress) {
      player.cashedOut = true;
      socket.emit("cashed_out", { multiplier });
      console.log(`${player.username} cashed out at ${multiplier}x`);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    players = players.filter(p => p.id !== socket.id);
  });
});

const startGameLoop = () => {
  setInterval(() => {
    if (!gameInProgress) {
      players = [];
      multiplier = 1;
      crashPoint = randomCrashPoint();
      gameInProgress = true;
      io.emit("game_start");

      crashTimer = setInterval(() => {
        multiplier = parseFloat((multiplier + 0.05).toFixed(2));
        io.emit("multiplier_update", multiplier);

        if (multiplier >= crashPoint) {
          clearInterval(crashTimer);
          gameInProgress = false;
          const roundResults = players.map(p => ({
            username: p.username,
            result: p.cashedOut ? "Won" : "Lost",
            multiplier: p.cashedOut ? multiplier : crashPoint
          }));
          io.emit("game_crash", { crashPoint, roundResults });

          // Wait 30 seconds before next game
          setTimeout(() => {
            io.emit("game_wait", 30);
          }, 1000);
        }
      }, 200);
    }
  }, 35000); // new round every 35s
};

startGameLoop();

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });

const mongoose = require("mongoose");
const http = require("http");
const socketIo = require("socket.io");
const app = require("./app");
const initDefaultUser = require("./Controller/initDefaultUser");
const UserLogin = require("./Models/LogInDentalSchema");

const OFFLINE_DELAY = process.env.OFFLINE_DELAY || 5000;

app.set("trust proxy", true);

const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.set("socketio", io); // ✅ IMPORTANT (use same key)

io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  socket.on("register-user", async (userId, role) => {
    if (!userId || !role) return;

    const normalizedRole = role.toLowerCase();

    socket.userId = userId;
    socket.role = normalizedRole;

    // =====================================
    // 🧩 ROLE ROOM (existing logic)
    // =====================================
    socket.join(normalizedRole);

    // =====================================
    // 👤 PRIVATE ROOM (SENDER ONLY)
    // =====================================
    socket.join(`user-${userId}`);

    // =====================================
    // 🛡️ ADMIN ROOM
    // =====================================
    if (normalizedRole === "admin") {
      socket.join("admin");
    }

    // =====================================
    // 🧾 RECEPTIONIST ROOM
    // =====================================
    if (normalizedRole === "receptionist") {
      socket.join("receptionist");
    }

    console.log(`✅ Registered ${userId} (${normalizedRole})`);
    console.log("📦 Rooms:", [...socket.rooms]);
  });

  socket.on("disconnect", () => {
    if (socket.userId) {
      setTimeout(async () => {
        await UserLogin.findByIdAndUpdate(socket.userId, {
          status: "offline",
        });
        console.log(`💤 ${socket.userId} OFFLINE`);
      }, OFFLINE_DELAY);
    }
  });
});

mongoose
  .connect(process.env.CONN_STR)
  .then(async () => {
    console.log("✅ DB Connected");
    await initDefaultUser();
  });

const port = process.env.PORT || 8000;
server.listen(port, () => {
  console.log(`🚀 Server running on ${port}`);
});
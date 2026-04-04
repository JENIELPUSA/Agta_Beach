const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });

const mongoose = require("mongoose");
const http = require("http");
const socketIo = require("socket.io");
const app = require("./app");
const initDefaultUser = require("./Controller/initDefaultUser");


app.set("trust proxy", true);

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception! Shutting down...");
  console.error(err);
  process.exit(1);
});

const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket"],
  pingInterval: 25000,
  pingTimeout: 60000,
});

app.set("io", io);

global.connectedUsers = {};
let messageCount = 0;

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("register-user", (linkId, role) => {
    global.connectedUsers[linkId] = {
      socketId: socket.id,
      role,
    };
    console.log(
      `Registered ${role} with linkId ${linkId} => socket ${socket.id}`
    );
  });

  socket.on("newRequest", (data) => {
    messageCount++;
    console.log("New request received:", data);

    const { doctor_id } = data;
    const message = {
      message: "A new request has been added!",
      data,
      count: messageCount,
    };

    for (const linkId in global.connectedUsers) {
      const { socketId, role } = global.connectedUsers[linkId];

      if (
        (doctor_id &&
          (role === "admin" || role === "officer" || linkId === doctor_id)) ||
        (!doctor_id && role === "officer")
      ) {
        io.to(socketId).emit("adminNotification", message);
        io.to(socketId).emit("SMSNotification", message);
      }
    }
  });

  socket.on("RefreshData", () => {
    console.log("RefreshData triggered");
    socket.emit("refreshRequests");
  });
  socket.on("clearNotifications", () => {
    messageCount = 0;
    io.emit("notificationCountReset", { count: 0 });
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);

    for (const linkId in global.connectedUsers) {
      if (global.connectedUsers[linkId].socketId === socket.id) {
        delete global.connectedUsers[linkId];
        console.log(`Removed user ${linkId} from connectedUsers`);
        break;
      }
    }
  });
});

mongoose
  .connect(process.env.CONN_STR)
  .then(async () => {
    console.log("✅ Database connected successfully");

    await initDefaultUser();
  })
  .catch((err) => {
    console.error("❌ DB connection error:", err.message);
    process.exit(1);
  });
  
const port = process.env.PORT || 8000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection! Shutting down...");
  console.error(err);
  server.close(() => process.exit(1));
});




const express = require("express");
const cors = require("cors");

const morgan = require("morgan");
const path = require("path");

const ErrorController = require("./Controller/errorController");
const session = require("express-session");
const MongoStore = require("connect-mongo");

const AdminRoute = require("./Routes/AdminRoute");

const Notification = require("./Routes/NotificationRoute");

const authentic = require("./Routes/authRouter");

const SbmemberRoute = require("./Routes/SbmemberRoute");

const CustomerRoute = require("./Routes/CustomerRoute");

const ApproverRoute = require("./Routes/ApproverRoute");

const BookingRoute = require("./Routes/ActionBookingRoute");

const OfferServiceRoute = require("./Routes/OfferServiceRoute");

let app = express();

const logger = function (req, res, next) {
  console.log("Middleware Called");
  next();
};

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.set("trust proxy", true);
app.use(
  session({
    secret: process.env.SECRET_STR,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.CONN_STR,
      ttl: 12 * 60 * 60, // 12 hours in seconds
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "none",
      maxAge: 12 * 60 * 60 * 1000,
    },
    rolling: true,
  }),
);
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PATCH", "DELETE","PUT"],
    credentials: true,
  }),
);

app.use(logger);

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}


const uploadsDir = path.join(__dirname, "..", "uploads");


app.use("/uploads", express.static(uploadsDir));
app.use("/api/v1/bookings", BookingRoute);
app.use("/api/v1/authentication", authentic);
app.use("/api/v1/Admin", AdminRoute);
app.use("/api/v1/Notification", Notification);
app.use("/api/v1/SbmemberRoute", SbmemberRoute);
app.use("/api/v1/Approver", ApproverRoute);
app.use("/api/v1/Customer", CustomerRoute);
app.use("/api/v1/OfferService", OfferServiceRoute);



app.use(ErrorController);

module.exports = app;

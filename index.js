const express = require("express");
const cors = require("cors");
const { connect } = require("mongoose");
require("dotenv").config();
const upload = require("express-fileupload")

//import routes
const userRoutes = require("./routes/userRoutes")
const postRoutes = require("./routes/postRoutes")
const {notFound, errorHandler} = require("./middlewares/errorMiddleware");

// express app
const app = express();


// middlewares
app.use(express.json({ extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(upload())
app.use("/uploads", express.static(__dirname + "/uploads"))

// cors middleware
app.use(
  cors({
    credentials: true,
    origin: "http://localhost:5173",
  })
);


// routes
app.use("/api/users", userRoutes)
app.use("/api/posts", postRoutes)


// error Handling
app.use(notFound);
app.use(errorHandler);


// mongodb connection
connect(process.env.MONGO_URL)
  .then(
    app.listen(process.env.PORT || 5000, () => {
      console.log("Mongodb connected");
      console.log(`Server running on port ${process.env.PORT}`);
    })
  )
  .catch((error) => {
    console.log(error);
  });

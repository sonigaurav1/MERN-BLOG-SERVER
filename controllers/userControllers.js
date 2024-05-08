const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");

const User = require("../models/userModel");
const HttpError = require("../models/errorModel");

// ============================= Register New User ================================
// POST : /api/users/register
// UNPROTECTED
const registerUser = async (req, res, next) => {
  try {
    const { fullname, email, password } = req.body;
    if (!fullname || !email || !password) {
      return next(new HttpError("Fill in all fields.", 422));
    }

    const newEmail = email.toLowerCase();
    const emailExists = await User.findOne({ email: newEmail });

    if (emailExists) {
      return next(new HttpError("Email already exists.", 422));
    }

    if (password.trim().length < 6) {
      return next(
        new HttpError("Password must be at least 6 characters.", 422)
      );
    }

    // if(password != password2){
    //     return next(new HttpError("Password do not match.", 422))
    // }

    // Generating a salt for the password using bcrypt
    const salt = await bcrypt.genSalt(10);
    // Hashing the password using the generated salt
    const hashedPassword = await bcrypt.hash(password, salt);

    // Registering the new user in the database
    const newUser = await User.create({
      name: fullname,
      email: newEmail,
      password: hashedPassword,
    });

    res.status(201).json(`New User ${newUser.email} registered.`);
  } catch (error) {
    return next(new HttpError("User registration failed", 422));
  }
};

// ============================= Login a Register User ================================
// POST : /api/users/login
// UNPROTECTED
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return next(new HttpError("Fill all the fields.", 422));
    }

    const newEmail = email.toLowerCase();

    // Check if user exists
    const user = await User.findOne({ email: newEmail });
    if (!user) {
      return next(
        new HttpError(
          "We couldn't find an account linked to this email address.",
          422
        )
      );
    }

    // Check if password is correct
    const comparePass = await bcrypt.compare(password, user.password);
    if (!comparePass) {
      return next(
        new HttpError("The password you’ve entered is incorrect.", 401)
      );
    }

    // Token generation
    const { _id: id, name } = user;
    const token = jwt.sign({ id, name }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(200).json({ token, id, name, newEmail });
  } catch (error) {
    return next(
      new HttpError("Login failed. Please check your credentials.", 422)
    );
  }
};

// ============================= USER PROFILE ================================
// GET : /api/users/:id
// PROTECTED
const getUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("-password"); // Excluding password
    if (!user) {
      return next(new HttpError("User not found.", 404));
    }

    res.status(200).json(user);
  } catch (error) {
    return next(new HttpError(error));
  }
};

// ============================= Change User Avatar (profile picture) ================================
// POST : /api/users/change-avatar
// PROTECTED
const changeAvatar = async (req, res, next) => {
  try {
    if (!req.files.avatar) {
      return next(new HttpError("Please choose an image.", 422));
    }

    // find user from database
    const user = await User.findById(req.user.id);

    // delete old avatar if exists
    if (user.avatar) {
      fs.unlink(path.join(__dirname, "..", "uploads", user.avatar), (err) => {
        if (err) {
          return next(new HttpError(err));
        }
      });
    }

    const { avatar } = req.files;

    // check file size (500kb)
    if (avatar.size > 500000) {
      return next(
        new HttpError("Profile picture too big. Should be less than 500kb"),
        422
      );
    }

    let fileName = avatar.name;
    let splittedFilename = fileName.split(".");
    let fileExtension = splittedFilename[splittedFilename.length - 1];
    let newFilename = uuid() + "." + fileExtension;

    avatar.mv(
      path.join(__dirname, "..", "uploads", newFilename),
      async (err) => {
        if (err) {
          // If there's an error moving the avatar file, sending an HTTP error response.
          return next(new HttpError(err));
        }
    
        // Updating the user's avatar in the database.
        const updatedAvatar = await User.findByIdAndUpdate(
          req.user.id,
          {
            avatar: newFilename,
          },
          { new: true } // Return the updated document
        ).select("avatar");
    
        // If the avatar couldn't be updated, sending an HTTP error response.
        if (!updatedAvatar) {
          return next(new HttpError("Avatar couldn't be changed.", 422));
        }
    
        // Sending a success response with the updated avatar data.
        res.status(200).json(updatedAvatar);
      }
    );    
  } catch (error) {
    return next(new HttpError(error));
  }
};

// ============================= EDIT USER DETAILS (from profile) ================================
// PATCH : /api/users/edit-user
// PROTECTED
const editUser = async (req, res, next) => {
  try {
    const { name, email, currentPassword, newPassword, confirmNewPassword } =
      req.body;
    if (!name || !email || !currentPassword || !newPassword) {
      return next(new HttpError("Fill in all fields.", 422));
    }

    // geting user from database
    const user = await User.findById(req.user.id);

    // checking if user exists
    if (!user) {
      return next(new HttpError("User not found.", 403));
    }

    // make sure new email doesn't already exist
    const emailExists = await User.findOne({ email });

    // we want to update other details with/without changing the email (which is a unique id because we use it to login)
    if (emailExists && emailExists._id != req.user.id) {
      return next(new HttpError("Email already exists.", 422));
    }

    // comparing current password to db password
    const validateUserPassword = await bcrypt.compare(
      currentPassword,
      user.password
    );

    // if current password doesn't match, return an error
    if (!validateUserPassword) {
      return next(new HttpError("Current password do not match.", 422));
    }

    // compare new passwords
    if (newPassword !== confirmNewPassword) {
      return next(new HttpError("New passwords do not match.", 422));
    }

    // Check if the current password and new password are the same
    if (currentPassword === newPassword) {
      // If they are same, return an error indicating that
      // the new password must be different from the current password
      return next(
        new HttpError(
          "New password must be different from the current password.",
          422
        )
      );
    }

    // hashing new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // updating user info in database
    const newInfo = await User.findByIdAndUpdate(
      req.user.id,
      { name, email, password: hashedPassword },
      { new: true }
    ).select("-password");

    // sending new info to client
    res.status(200).json(newInfo);
  } catch (error) {
    return next(new HttpError(error));
  }
};

// ============================= GET AUTHORS ================================
// GET : /api/users/authors
// UNPROTECTED
const getAuthors = async (req, res, next) => {
  try {
    const authors = await User.find().select("-password");
    // if no authors are found in database
    if (authors.length === 0) {
      return next(new HttpError("No authors have registered in the database.", 404));
    }
    res.json(authors);
  } catch (error) {
    return next(new HttpError("No Authors Found.", 404));
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUser,
  changeAvatar,
  editUser,
  getAuthors,
};

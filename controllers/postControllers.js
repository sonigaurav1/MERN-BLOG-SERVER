const Post = require("../models/postModel");
const User = require("../models/userModel");
const path = require("path");
const fs = require("fs");
const { v4: uuid } = require("uuid");
const HttpError = require("../models/errorModel");

// ============================= CREATE POST ================================
// POST : /api/posts/create-post
// PROTECTED
const createPost = async (req, res, next) => {
  try {
    let { title, category, description } = req.body;
    if (!title || !category || !description || !req.files) {
      return next(
        new HttpError("Fill in all fields and choose thumbnail.", 422)
      );
    }
    // Validate category input
    if (!isValidCategory(req.body.category)) {
      return next(new HttpError("Invalid category.", 422));
    }

    const { thumbnail } = req.files;

    // check the file size
    if (thumbnail.size > 2000000) {
      return next(
        new HttpError("Thumbnail too big. File should be less than 2mb.", 422)
      );
    }
    let fileName = thumbnail.name;
    let splittedFilename = fileName.split(".");
    let fileExtension = splittedFilename[splittedFilename.length - 1];
    let newFilename = uuid() + "." + fileExtension;
    thumbnail.mv(
      path.join(__dirname, "..", "/uploads", newFilename),
      async (err) => {
        if (err) {
          return next(new HttpError(err));
        }
        const newPost = await Post.create({
          title,
          category,
          description,
          thumbnail: newFilename,
          creator: req.user.id,
        });
        if (!newPost) {
          return next(new HttpError("Post couldn't be created.", 422));
        }
        // find user and increase post count by 1
        const currentUser = await User.findById(req.user.id);
        const userPostCount = currentUser?.posts + 1;
        await User.findByIdAndUpdate(req.user.id, { posts: userPostCount });

        res.status(200).json(newPost);
      }
    );
  } catch (error) {
    return next(new HttpError(error));
  }
};

// ============================= GET ALL POSTS ================================
// GET : /api/posts
// UNPROTECTED
const getPosts = async (req, res, next) => {
  try {
    const posts = await Post.find()
      .sort({ updatedAt: -1 }) // -1 for latest Posts and 1 for oldest Posts
      .populate({
        path: "creator",
        select: "_id name posts avatar", // Excluding password field
      });
    if (posts.length === 0) {
      return next(new HttpError("Database has empty post.", 404));
    }
    res.status(200).json(posts);
  } catch (error) {
    return next(new HttpError("No posts found", 404));
  }
};

// ============================= GET SINGLE POST ================================
// GET : /api/posts/:id
// UNPROTECTED
const getPost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id).populate({
      path: "creator",
      select: "avatar name",
    });

    // Now, you can access the populated "creator" field and select the "avatar" from it
    if (!post) {
      return next(new HttpError("Post not found", 404));
    }
    res.status(200).json(post);
  } catch (error) {
    return next(new HttpError(error));
  }
};

// ============================= GET POSTS BY CATEGORY ================================
// GET : /api/posts/categories/:category
// UNPROTECTED
const getCatPosts = async (req, res, next) => {
  try {
    let regex = new RegExp(`^${req.params.category}$`, "i"); //  i -> case insensitive you will get all doc with Art or art.
    const posts = await Post.find({ category: regex })
      .sort({ updatedAt: -1 })
      .populate({
        path: "creator",
        select: "name avatar",
      }); // Alternative option without regex :- req.params
    if (posts.length === 0) {
      return next(new HttpError("Database has empty post.", 404));
    }
    res.status(200).json(posts);
  } catch (error) {
    return next(new HttpError("No Post Found", 422));
  }
};

// ============================= GET AUTHOR POST ================================
// GET : /api/posts/users/:id
// UNPROTECTED
const getUserPosts = async (req, res, next) => {
  try {
    // console.log(req.params.id)
    const posts = await Post.find({ creator: req.params.id })
      .sort({
        updatedAt: -1,
      })
      .populate({
        path: "creator",
        select: "name avatar",
      });
    if (posts.length === 0) {
      return next(new HttpError("Database has empty post.", 404));
    }
    res.status(200).json(posts);
  } catch (error) {
    return next(new HttpError("Post not found", 404));
  }
};

// ============================= EDIT POST ================================
// PATCH : /api/posts/:id
// PROTECTED
const editPost = async (req, res, next) => {
  try {
    let filename;
    let newFilename;
    let updatedPost;
    let postId = req.params.id;
    const { title, category, description } = req.body;

    // ReactQuill has a paragraph opening and closing tag with a <br> in between so there are 11 characters in there already.
    if (!title || !category || description.length < 12) {
      return next(new HttpError("Fill in all fields.", 422));
    }

    // Validate category input
    if (!isValidCategory(req.body.category)) {
      return next(new HttpError("Invalid category.", 422));
    }

    // get old post from database
    const oldPost = await Post.findById(postId);

    // oldPost exists
    if (!oldPost) {
      return next(new HttpError("Post not found.", 404));
    }

    // check if user is the creator of the post
    if (req.user.id == oldPost.creator) {
      if (!req.files) {
        updatedPost = await Post.findByIdAndUpdate(
          postId,
          {
            title,
            category,
            description,
          },
          {
            new: true, // return the updated post
          }
        );
      } else {
        // delete old thumbnail from uploads folder
        fs.unlink(
          path.join(__dirname, "..", "uploads", oldPost.thumbnail),
          async (err) => {
            if (err) {
              console.log(err);
            }
          }
        );
        // upload new thumbnail
        const { thumbnail } = req.files;
        //check file size
        if (thumbnail.size > 2000000) {
          return next(
            new HttpError("Thumbnail too big. Should be less than 2mb.")
          );
        }
        filename = thumbnail.name;
        let splittedFilename = filename.split(".");
        newFilename =
          splittedFilename[0] +
          uuid() +
          "." +
          splittedFilename[splittedFilename.length - 1];
        thumbnail.mv(
          path.join(__dirname, "..", "uploads", newFilename),
          async (err) => {
            if (err) {
              return next(new HttpError(err));
            }
          }
        );
        updatedPost = await Post.findByIdAndUpdate(
          postId,
          { title, category, description, thumbnail: newFilename },
          { new: true }
        );
      }
    }

    if (!updatedPost) {
      return next(new HttpError("Couldn't update post.", 400));
    }

    res.status(200).json(updatedPost);
  } catch (error) {
    return next(new HttpError(error));
  }
};

// ============================= DELETE POST ================================
// DELETE : /api/posts/:id
// PROTECTED
const deletePost = async (req, res, next) => {
  try {
    const postId = req.params.id;
    const post = await Post.findById(postId);
    if (!post) {
      return next(new HttpError("Post unavailable", 404));
    }
    // Check if user is the owner of the post
    if (post.creator == req.user.id) {
      const fileName = post?.thumbnail;
      // delete thumbnail from uploads folder
      fs.unlink(
        path.join(__dirname, "..", "uploads", fileName),
        async (err) => {
          if (err) {
            return next(new HttpError(err));
          } else {
            await Post.findByIdAndDelete(postId);
            // Delete post count from user
            const currentUser = await User.findById(req.user.id);
            const userPostCount = currentUser?.posts - 1;
            await User.findByIdAndUpdate(req.user.id, {
              posts: userPostCount,
            });
            res.status(200).json(`Post ${postId} deleted successfully`);
          }
        }
      );
    } else {
      return next(
        new HttpError("You are not allowed to delete this post", 401)
      );
    }
  } catch (error) {
    return next(new HttpError(error));
  }
};

module.exports = {
  createPost,
  getPosts,
  getPost,
  getCatPosts,
  getUserPosts,
  editPost,
  deletePost,
};

// Function to validate category input
function isValidCategory(category) {
  // Check if category is in enum list
  return [
    "Agriculture",
    "Business",
    "Education",
    "Entertainment",
    "Art",
    "Investment",
    "Uncategorized",
    "Weather",
  ].includes(category);
}

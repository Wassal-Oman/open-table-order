// import needed libraries
const path = require("path");
const express = require("express");
const firebase = require("firebase");
const admin = require("firebase-admin");
const { Storage } = require("@google-cloud/storage");
const Multer = require("multer");
const uuid = require('uuid/v1');
const router = express.Router();

// firebase configuration
const config = {
  apiKey: "AIzaSyAZQ6TVS78ev_L8y1WQhASTey1Lpf23oHE",
  authDomain: "open-table-order.firebaseapp.com",
  databaseURL: "https://open-table-order.firebaseio.com",
  projectId: "open-table-order",
  storageBucket: "open-table-order.appspot.com",
  messagingSenderId: "490924830279"
};

// initialize firebase
firebase.initializeApp(config);

// firebase admin configuration
const adminConfig = require(path.join(__dirname, "ServiceAccountKey"));

// initialize firebase admin
admin.initializeApp({
  credential: admin.credential.cert(adminConfig),
  databaseURL: "https://open-table-order.firebaseio.com"
});

// firebase database
const db = admin.firestore();

// firebase storage
const storage = new Storage({
  projectId: "open-table-order",
  keyFilename: path.join(__dirname, "ServiceAccountKey.json")
});

// storage bucket
const bucket = storage.bucket("gs://open-table-order.appspot.com/");

// multer storage
const multer = Multer({
  storage: Multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

// middleware function to check for logged-in users
const sessionChecker = (req, res, next) => {
  if (!firebase.auth().currentUser && !req.session.user) {
    res.redirect("/login");
  } else {
    next();
  }
};

// default
router.get("/", sessionChecker, (req, res) => {
  res.redirect("/admin/home");
});

// login - GET
router.get("/login", (req, res) => {
  if (firebase.auth().currentUser) {
    res.redirect("/admin/home");
  }
  res.render("login");
});

// login - POST
router.post("/login", (req, res) => {
  // get user input
  const { email, password } = req.body;

  // authenticate user
  firebase
    .auth()
    .signInWithEmailAndPassword(email, password)
    .then(data => {
      // get user details
      db.collection("users")
        .doc(data.user.uid)
        .get()
        .then(document => {
          if (document.exists) {
            console.log(document.data());
            req.session.user = document.data();
            if (document.data().type === "Admin") {
              res.redirect("/admin/home");
            } else if (document.data().type === "Restaurant_Admin") {
              res.redirect(`/restaurant/home/${document.data().restaurant_id}`);
            } else {
              console.log("Customer is trying to login");
              req.flash("error", "Wrong email or password");
              res.redirect("/logout");
            }
          } else {
            console.log("No User Data");
            req.flash("error", "Wrong email or password");
            res.redirect("/logout");
          }
        })
        .catch(err => {
          console.log(err);
          res.redirect("/500");
        });
    })
    .catch(err => {
      console.log(err);
      req.flash("error", "Wrong email or password");
      res.redirect("/login");
    });
});

// home
router.get("/admin/home", sessionChecker, (req, res) => {
  const user = req.session.user;
  res.render("admin/home", {
    user
  });
});

// users
router.get("/admin/users", sessionChecker, (req, res) => {
  // empty array
  let users = [];

  // get data
  db.collection("users")
    .get()
    .then(snapshot => {
      // load users' data
      snapshot.forEach(doc => {
        users.push(doc.data());
      });

      // render users page
      res.render("admin/users", {
        users
      });
    })
    .catch(err => {
      console.log(err);
      res.redirect("/500");
    });
});

// delete users
router.get("/admin/users/:id/delete", sessionChecker, (req, res) => {
  // get user id
  const id = req.params.id;

  // delete user from authentication
  let authDeletePromise = admin.auth().deleteUser(id);
  let dbDeletePromise = db
    .collection("users")
    .doc(id)
    .delete();

  Promise.all([authDeletePromise, dbDeletePromise])
    .then(() => {
      console.log("user deleted");
      res.redirect("/admin/users");
    })
    .catch(err => {
      console.log("auth error", err);
      res.redirect("/admin/users");
    });
});

// add user
router.get("/admin/users/add", sessionChecker, (req, res) => {
  // render users page
  res.render("admin/addUser");
});

// store user
router.post("/admin/users/store", sessionChecker, (req, res) => {
  // get inputs
  const { name, email, phone, password, type } = req.body;

  console.log(req.body);

  // create user
  admin
    .auth()
    .createUser({
      email,
      password
    })
    .then(user => {
      console.log(user);

      // store in database
      db.collection("users")
        .doc(user.uid)
        .set({
          id: user.uid,
          name,
          email,
          phone,
          type
        })
        .then(val => {
          console.log(val);
          res.redirect("/admin/users");
        })
        .catch(err => {
          console.log(err);
          res.redirect("/500");
        });
    })
    .catch(err => {
      console.log(err);
      res.redirect("/500");
    });
});

// add restaurant user
router.get("/admin/restaurants/users/:restaurant_id/add", sessionChecker, (req, res) => {
  const restaurant_id = req.params.restaurant_id;
  res.render("admin/addRestaurantUser", {
    restaurant_id
  });
});

// store restaurant user
router.post("/admin/restaurants/users/store", sessionChecker, (req, res) => {
  const { name, email, phone, password, type, restaurant_id } = req.body;
  console.log(req.body);

  // create user
  admin
    .auth()
    .createUser({
      email,
      password
    })
    .then(user => {
      console.log(user);

      // store in database
      db.collection("users")
        .doc(user.uid)
        .set({
          id: user.uid,
          name,
          email,
          phone,
          type,
          restaurant_id
        })
        .then(val => {
          console.log(val);
          res.redirect(`/admin/restaurants/${restaurant_id}`);
        })
        .catch(err => {
          console.log(err);
          res.redirect("/500");
        });
    })
    .catch(err => {
      console.log(err);
      res.redirect("/500");
    });
});

// restaurants
router.get("/admin/restaurants", sessionChecker, (req, res) => {
  // empty array
  let restaurants = [];

  // get data
  db.collection("restaurants")
    .get()
    .then(snapshot => {
      // load restaurants' data
      snapshot.forEach(doc => {
        restaurants.push(doc.data());
      });

      // render restaurants page
      res.render("admin/restaurants", {
        restaurants
      });
    })
    .catch(err => {
      console.log(err);
      res.redirect("/500");
    });
});

// add restaurant
router.get("/admin/restaurants/add", sessionChecker, (req, res) => {
  res.render("admin/addRestaurant");
});

// store restaurant
router.post(
  "/admin/restaurants/store",
  sessionChecker,
  multer.single("file"),
  (req, res) => {
    // get inputs
    const {
      name,
      location,
      email,
      phone,
      website,
      latitude,
      longitude
    } = req.body;
    const file = req.file;

    if (file) {
      uploadImageToStorage(file)
        .then(val => {
          console.log(val);

          // add sweet data to firestore
          db.collection("restaurants")
            .doc()
            .set({
              id: uuid(),
              name,
              location,
              email,
              phone,
              website,
              latitude,
              longitude,
              image_name: val[0],
              image: val[1]
            })
            .then(val => {
              console.log(val);
              res.redirect("/admin/restaurants");
            })
            .catch(err => {
              console.log(err);
              res.redirect("/admin/restaurants/add");
            });
        })
        .catch(err => {
          console.log(err);
          res.redirect("/admin/restaurants/add");
        });
    } else {
      console.log("No file has been chosen");
      res.redirect("/admin/restaurants/add");
    }
  }
);

// view restaurant
router.get("/admin/restaurants/:id", sessionChecker, (req, res) => {
  const id = req.params.id;
  const users = [];

  let restaurantPromise = db.collection("restaurants").where("id", "==", id).get();
  let usersPromise = db.collection("users").where("restaurant_id", "==", id).get();

  Promise.all([restaurantPromise, usersPromise]).then(val => {
  
    val[1].docs.forEach(user => {
      users.push(user.data());
    });
    res.render("admin/restaurant", {
      restaurant: val[0].docs[0].data(),
      users
    });
  });
});

// delete restaurant
router.get("/admin/restaurants/:id/delete", sessionChecker, (req, res) => {
  // get id
  const id = req.params.id;

  if (id) {
    // get image file
    db.collection("restaurants")
      .doc(id)
      .get()
      .then(doc => {
        // load users' data
        if (doc.exists) {
          // delete image file from firebase storage
          bucket.file(doc.data().image_name).delete((err, api) => {
            if (err) {
              console.log(err);
              res.redirect("/admin/restaurants");
            } else {
              db.collection("restaurants")
                .doc(id)
                .delete()
                .then(val => {
                  // delete doctors associated to this center
                  db.collection("meals")
                    .where("restaurant_id", "==", id)
                    .get()
                    .then(snapshot => {
                      if (snapshot.docs.length > 0) {
                        // delete documents from database
                        snapshot.forEach(doc => {
                          db.collection("meals")
                            .doc(doc.id)
                            .delete();
                        });

                        console.log(val);
                        res.redirect("/admin/restaurants");
                      } else {
                        console.log(val);
                        res.redirect("/admin/restaurants");
                      }
                    })
                    .catch(err => {
                      console.log(err);
                      res.redirect("/admin/restaurants");
                    });
                })
                .catch(err => {
                  console.log(err);
                  res.redirect("/admin/restaurants");
                });
            }
          });
        } else {
          res.redirect("/admin/restaurants");
        }
      })
      .catch(err => {
        console.log(err);
        res.redirect("/admin/restaurants");
      });
  } else {
    console.log("Restaurant ID cannot be empty");
    res.redirect("/admin/restaurants");
  }
});

// meals
router.get("/admin/meals", sessionChecker, (req, res) => {
  // empty array
  let meals = [];

  // get data
  db.collection("meals")
    .get()
    .then(snapshot => {
      // load meals' data
      snapshot.forEach(doc => {
        meals.push(doc.data());
      });

      // render meals page
      res.render("admin/meals", {
        meals
      });
    })
    .catch(err => {
      console.log(err);
      res.redirect("/500");
    });
});

// restaurant admin home
router.get("/restaurant/home/:restaurant_id", sessionChecker, (req, res) => {
  const user = req.session.user;
  const restaurant_id = req.params.restaurant_id;

  res.render("restaurant/home", {
    user,
    restaurant_id
  });
});

// restaurant info
router.get("/restaurant/info/:restaurant_id", sessionChecker, (req, res) => {
  const user = req.session.user;
  const restaurant_id = req.params.restaurant_id;
  const users = [];

  let restaurantPromise = db.collection("restaurants").where("id", "==", restaurant_id).get();
  let usersPromise = db.collection("users").where("restaurant_id", "==", restaurant_id).get();

  Promise.all([restaurantPromise, usersPromise]).then(val => {
  
    val[1].docs.forEach(user => {
      users.push(user.data());
    });
    res.render("restaurant/info", {
      user,
      users,
      restaurant_id,
      restaurant: val[0].docs[0].data()
    });
  });
});

// logout
router.get("/logout", sessionChecker, (req, res) => {
  firebase.auth().signOut();
  res.redirect("/login");
});

// 500
router.get("/500", (req, res) => {
  res.render("500");
});

/**
 * Function to handle files
 */
const uploadImageToStorage = file => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject("No image file");
    }

    let newFileName = `${file.originalname}_${Date.now()}`;

    let fileUpload = bucket.file(newFileName);

    const blobStream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype
      }
    });

    blobStream.on("error", err => {
      reject(err);
    });

    blobStream.on("finish", () => {
      // The public URL can be used to directly access the file via HTTP.
      const url = `https://firebasestorage.googleapis.com/v0/b/open-table-order.appspot.com/o/${
        fileUpload.name
      }?alt=media`;
      resolve([fileUpload.name, url]);
    });

    blobStream.end(file.buffer);
  });
};

// export router
module.exports = router;

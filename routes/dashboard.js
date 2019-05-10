// import needed libraries
const path = require("path");
const express = require("express");
const firebase = require("firebase");
const admin = require("firebase-admin");
const { Storage } = require("@google-cloud/storage");
const Multer = require("multer");
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
            } else if (document.data().type === "Restaurant") {
              res.redirect("/restaurant/home");
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
  res.render("admin/home");
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
router.get("/admin/users/:id/:type/delete", sessionChecker, (req, res) => {
  // get user id
  const id = req.params.id;
  const type = req.params.type;

  if (type === "Admin") {
    res.redirect("/admin/users");
  } else {
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
  }
});

// add user
router.get("/admin/users/add", sessionChecker, (req, res) => {
  // render users page
  res.render("admin/addUser");
});

// store user
router.post("/admin/users/store", sessionChecker, (req, res) => {
  // get inputs
  const { name, email, phone, password } = req.body;

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
          type: "Admin"
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

// restaurants
router.get("/admin/restaurants", sessionChecker, (req, res) => {
  res.render("admin/restaurants");
});

// add restaurant
router.get("/admin/restaurants/add", sessionChecker, (req, res) => {
  res.render("admin/addRestaurant");
});

// add restaurant
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

// abayas
router.get("/abayas", sessionChecker, (req, res) => {
  // empty array
  let abayas = [];

  // get data
  db.collection("abayas")
    .get()
    .then(snapshot => {
      // load users' data
      snapshot.forEach(doc => {
        abayas.push({
          id: doc.id,
          name: doc.data().name,
          price: doc.data().price,
          width: doc.data().width,
          height: doc.data().height,
          size: doc.data().size,
          color: doc.data().color,
          image: doc.data().image
        });
      });

      // render users page
      res.render("abayas", {
        abayas
      });
    })
    .catch(err => {
      console.log(err);
      res.redirect("/500");
    });
});

// add abaya
router.get("/abayas/add", sessionChecker, (req, res) => {
  res.render("addAbaya");
});

// store abaya
router.post(
  "/abayas/store",
  sessionChecker,
  multer.single("file"),
  (req, res) => {
    // get inputs
    const { name, type, price, width, height, color } = req.body;
    const file = req.file;

    if (file) {
      // try uploading the file
      uploadImageToStorage(file)
        .then(link => {
          // add sweet data to firestore
          db.collection("abayas")
            .doc()
            .set({
              name,
              price,
              width,
              height,
              type,
              color,
              image: link
            })
            .then(val => {
              console.log(val);
              res.redirect("/abayas");
            })
            .catch(err => {
              console.log(err);
              res.redirect("/abayas/add");
            });
        })
        .catch(err => {
          console.log(err);
          res.redirect("/abayas/add");
        });
    } else {
      console.log("No file has been chosen");
      res.redirect("/abayas/add");
    }
  }
);

// delete abaya
router.get("/abayas/:id/delete", sessionChecker, (req, res) => {
  // get id
  const id = req.params.id;

  if (id) {
    db.collection("abayas")
      .doc(id)
      .delete()
      .then(val => {
        console.log(val);
        res.redirect("/abayas");
      })
      .catch(err => {
        console.log(err);
        res.redirect("/abayas");
      });
  } else {
    console.log("Cannot get document id");
    res.redirect("/abayas");
  }
});

// edit abaya
router.get("/abayas/:name/edit", sessionChecker, (req, res) => {
  // get sweet name
  const name = req.params.name;
  let data = [];

  if (name) {
    // get sweet details
    db.collection("abayas")
      .where("name", "==", name)
      .get()
      .then(snapshot => {
        if (!snapshot.empty) {
          // fetch all results
          snapshot.forEach(doc => {
            data.push({
              id: doc.id,
              name: doc.data().name,
              type: doc.data().type,
              price: doc.data().price,
              color: doc.data().color,
              width: doc.data().width,
              height: doc.data().height
            });
          });

          // render edit sweet page
          res.render("editAbaya", {
            abaya: data[0]
          });
        } else {
          console.log("No data available for this abaya");
          res.redirect("/abayas");
        }
      })
      .catch(err => {
        console.log(err);
        res.redirect("/abayas");
      });
  } else {
    console.log("Cannot get abaya name");
    res.redirect("/abayas");
  }
});

// update abaya
router.post(
  "/abayas/update",
  sessionChecker,
  multer.single("file"),
  (req, res) => {
    // get sweet details
    const { id, name, type, price, color, width, height } = req.body;
    const file = req.file;

    if (file) {
      // try uploading the file
      uploadImageToStorage(file)
        .then(link => {
          // edit sweet data in firestore
          db.collection("abayas")
            .doc(id)
            .update({
              name,
              price,
              color,
              width,
              height,
              type,
              image: link
            })
            .then(val => {
              console.log(val);
              res.redirect("/abayas");
            })
            .catch(err => {
              console.log(err);
              res.redirect(`/abayas/${name}/edit`);
            });
        })
        .catch(err => {
          console.log(err);
          res.redirect(`/abayas/${name}/edit`);
        });
    } else {
      // edit sweet data in firestore
      db.collection("abayas")
        .doc(id)
        .update({
          name,
          price,
          color,
          width,
          height,
          type
        })
        .then(val => {
          console.log(val);
          res.redirect("/abayas");
        })
        .catch(err => {
          console.log(err);
          res.redirect(`/abayas/${name}/edit`);
        });
    }
  }
);

// orders
router.get("/orders", sessionChecker, (req, res) => {
  // empty array
  let orders = [];

  // get data
  db.collection("orders")
    .get()
    .then(snapshot => {
      // load users' data
      snapshot.forEach(doc => {
        orders.push(doc.data());
      });

      // render users page
      res.render("orders", {
        orders
      });
    })
    .catch(err => {
      console.log(err);
      res.redirect("/500");
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

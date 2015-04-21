var express = require('express');
var partials = require('express-partials');
var session = require('express-session');
var util = require('./lib/utility');
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt-nodejs');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();
var sess;

app.use(session({secret: 'ssshhhhh', cookie: {expires: new Date(Date.now() + 60000)}})); // Expires in 1 hour

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

// curl -X GET http://127.0.0.1:4568
app.get('/', util.checkUser,
function(req, res) {
  res.render('index');
});

app.get('/create', util.checkUser,
function(req, res) {
  res.render('index');
});

app.get('/links', util.checkUser,
function(req, res) {
  Links.reset().fetch().then(function(links) {

    res.send(200, links.models);
  });
});

//====== LOGIN ======
app.get('/login',
function(req, res) {
  res.render('login');
});

app.post('/login', function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  new User({ username: username}).fetch().then(function(found){
    if (found){
      var realPass = found.get('password');
      bcrypt.compare(password, realPass, function(err, istrue) {
        console.log(istrue);
        if(istrue){
          sess = req.session;
          sess.username = username;
          res.redirect('/');
        }
        else {
          console.log('wrong password!');
        }
      });
    }
    else {
      console.log('user does not exist');
    }
  });

});

//====== SIGNUP ======
app.get('/signup',
function(req, res) {
  res.render('signup');
});

app.post('/links', util.checkUser,
function(req, res) {
  var uri = req.body.url;
  console.log('uri',uri);

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.post('/signup',
function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  var salt = bcrypt.genSaltSync(4);
  bcrypt.hash(password, salt, null, function(err, hash) {

    new User({ username: username}).fetch().then(function(found){
      if (found){
        console.log('user exists');
      }
      else {
        var user = new User({
          username: username,
          password: hash,
          salt: salt
        });

        user.save().then(function(newUser){
          console.log('New user created:', newUser);
          sess = req.session;
          sess.username = username;
          res.redirect('/');
        });
      }
    });

  });
});



/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            console.log('REDIRECTING', link.get('url'));
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);

const express = require('express');
const router = express.Router();
const multer  = require('multer')
const fs = require('fs');
const rp = require('request-promise')
var request = require('request');
var querystring = require('querystring');




var client_id = process.env.SPOTIFY_CLIENT_ID;
var client_secret = process.env.SPOTIFY_CLIENT_SECRET;
var redirect_uri = 'http://localhost:3000/callback';

const uploader = multer({
  dest: "uploads/",
  limits: {
    fields: 10,
    fileSize: 1024*1024*20,
    files: 1,
  }
});


/* GET home page. */
router.get('/', (req, res, next) => {
  res.render('index');
});

/* GET home page. */
router.get('/app', (req, res, next) => {
  res.render('app', {title:"Songs by Movie/Game cover", access_token:req.query.access_token});
});


router.post('/uploadFile', uploader.single('uploadedFile'), (req, res) => {

    // get the temporary location of the file
    var tmp_path = req.file.path;
    // set where the file should actually exists - in this case it is in the "images" directory
    const fileName = req.file.filename + '.' + req.file.mimetype.split('/')[1];
    var target_path = './public/images/' + fileName
    // move the file from the temporary location to the intended location
    fs.rename(tmp_path, target_path, function(err) {
        if (err) throw err;
        // delete the temporary file, so that the explicitly set temporary upload dir does not get filled with unwanted files
        fs.unlink(tmp_path, function() {
            if (err) throw err;
        });
    });

	var options = {
	    method: 'POST',
	    uri: 'https://vision.googleapis.com/v1/images:annotate?key=' + process.env.GOOGLE_VISION_KEY,
	    body: {
		  "requests":[
		    {
		      "image":{
				  "content": base64_encode(target_path)
			},
		      "features":[
		        {
		          "type":"WEB_DETECTION",
		          "maxResults":10
		        }
		      ]
		    }
		  ]
		},
	    json: true
	};

	 
	rp(options)
	    .then(function (parsedBody) {
	        res.json(parsedBody)
	    })
	    .catch(function (err) {
	        console.log(err)
	    });

});


router.post('/getSoundTracks', (req, res, next) => {

  	var options = {
	    method: 'GET',
	    uri: 'https://api.spotify.com/v1/search?q=' + req.body.coverName + "&type=album&limit=10",
	    headers: {
       		'Authorization': 'Bearer ' + req.body.access_token
   		},
	    json: true
	};

	rp(options)
	    .then(function (parsedBody) {
	        res.json(parsedBody)
	    })
	    .catch(function (err) {
	        console.log(err)
	});

});

//spotify stuff

var stateKey = 'spotify_auth_state';

router.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

router.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };


    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          console.log(body);
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/app?' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

router.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});



// function to encode file data to base64 encoded string
function base64_encode(file) {
    // read binary data
    var bitmap = fs.readFileSync(file);
    // convert binary data to base64 encoded string
    return new Buffer(bitmap).toString('base64');
}


var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

module.exports = router;


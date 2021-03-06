// This loads the environment variables from the .env file
require('dotenv-extended').load();

var builder = require('botbuilder');
var restify = require('restify');
var Store = require('./store');
var spellService = require('./spell-service');
var rp = require('request-promise');
var cheerio = require('cheerio');
var express = require('express'),
  bodyParser = require('body-parser'),
  http = require('http'),
  app = express(),
  request = require('request'),
  token = 'EAACasJmyVHoBAFKXrYUcJEYMHdI9pyHdZCbWMxuDTqIltiZApF9dPfYFD2IirC9FFiwldCgZBaerJqFn4GXBAjZA5TyF7q8Iv8QiBhQZCQEHtcLwCDaMQfQrgvlbnWdPM7UEYeoYgZBZC0xNjjud9k8WMLiA91ml3wFUPOdaZCQNB6RJtvF9KOqA';
var gamesArray = [];

var Game = function() {
  this.name = null;
  this.price = null;
  this.imageSrc = null;
  this.link = null;
  this.tags = null;
};

// Create connector and listen for messages
var connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});

app.use(bodyParser.json());

// set port
app.set('port', 8080);

// start the server
http.createServer(app).listen(app.get('port'), function() {
  console.log('Express server listening on port ' + app.get('port'));
});

app.post('/api/messages', connector.listen());

// app.get('/', function(req, res) {
//   if (req.query['hub.verify_token'] === 'st34m_cl0v3r_t0k3n') {
//     res.send(req.query['hub.challenge']);
//   } else {
//     res.send('Error, wrong validation token');
//   }
// });
//
// app.post('/', function(req, res) {
//   var id = req.body.entry[0].messaging[0].sender.id;
//   var text = req.body.entry[0].messaging[0].message.text;
//   app.messageHandler(text, id, function(result){
//         console.log("Async Handled: " + result);
//       });
//   res.send(req.body);
// });
// app.messageHandler = function(text, id, cb) {
//   var data = {
//     "recipient": {
//       "id": id
//     },
//     "message": {
//       "text": text
//     }
//   };
//   var reqObj = {
//     url: 'https://graph.facebook.com/v2.6/me/messages',
//     qs: {
//       access_token: token
//     },
//     method: 'POST',
//     json: data
//   };
//   console.log(JSON.stringify(reqObj));
//   request(reqObj, function(error, response, body) {
//     if (error) {
//       console.log('Error sending message: ', JSON.stringify(error));
//       cb(false);
//     } else if (response.body.error) {
//       console.log("API Error: " + JSON.stringify(response.body.error));
//       cb(false);
//     } else {
//       cb(true);
//     }
//   });
// };

var bot = new builder.UniversalBot(connector, function(session) {
  session.send('Sorry, I did not understand \'%s\'. Type \'help\' if you need assistance.', session.message.text);
});

// You can provide your own model by specifing the 'LUIS_MODEL_URL' environment variable
// This Url can be obtained by uploading or creating your model from the LUIS portal: https://www.luis.ai/
var recognizer = new builder.LuisRecognizer(process.env.LUIS_MODEL_URL);
bot.recognizer(recognizer);

bot.dialog('SearchComputerGame', [
  function(session, args, next) {
    session.send('Welcome to the Games finder! What kind of game would you like to find?');
  }
]).triggerAction({
  matches: 'SearchComputerGame',
  onInterrupted: function(session) {
    session.send('Querry computer canceled');
  }
});

bot.dialog('FindGames', [
  function(session, args, next) {
    var genreEntity = builder.EntityRecognizer.findEntity(args.intent.entities, 'Game');
    session.send('We are analyzing your message: \'%s\'', genreEntity.entity);

    getGenreGames(genreEntity.entity, function(data) {
      if (data.length > 0) {
        session.send('Look at this %s games:', genreEntity.entity);
        var message = new builder.Message()
          .attachmentLayout(builder.AttachmentLayout.carousel)
          .attachments(data.map(gameAsAttachment));

        session.send(message);
        session.endDialog();
      }
    });
  }
]).triggerAction({
  matches: 'FindGames',
  onInterrupted: function(session) {
    session.send('Querry genre canceled');
  }
});

bot.dialog('Help', function(session) {
  console.log(session);
  session.endDialog('Hi! Welcome to SteamGamesBot Try asking me things like \'search rpg\', \'search adventure\' or \'search platformer\'');
}).triggerAction({
  matches: 'Help'
});

function getGenreGames(genre, result) {
  var url = 'http://store.steampowered.com/tag/en/' + genre + '#p=0&tab=TopSellers';
  console.log(url);
  rp(url)
    .then(function(htmlString) {
      $ = cheerio.load(htmlString);
      var games = [];
      $('.tab_item', '#TopSellersRows').each(function(i, elem) {
        // console.log($(this).attr('href'));
        var game = new Game();
        game.link = $(this).attr('href');
        games[i] = $(this).html();
        gamesArray[i] = game;
      });

      for (var i = 0; i < games.length; i++) {

        var element = games[i];
        var game = gamesArray[i];
        var tags = $('.tab_item_top_tags', element).map(function(i, el) {
          // this === el
          return $(this).text();
        }).get().join(', ');

        game.price = $('.discount_final_price', element).text();
        game.name = $('.tab_item_name', element).text();
        game.imageSrc = $('.tab_item_cap_img', element).attr('src');
        game.tags = tags;
      }
      result(gamesArray);
    })
    .catch(function(err) {
      // Crawling failed
      if (err) {
        // result(gamesArray);
      }

    });
}
// Helpers
function gameAsAttachment(game) {

  return new builder.HeroCard()
    .title(game.name)
    .subtitle(game.tags)
    .text(game.price)
    .images([new builder.CardImage().url(game.imageSrc)])
    .buttons([
      new builder.CardAction()
      .title('Check it out')
      .type('openUrl')
      .value(game.link)
    ]);
}

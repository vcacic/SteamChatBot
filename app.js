// This loads the environment variables from the .env file
require('dotenv-extended').load();

var builder = require('botbuilder');
var restify = require('restify');
var Store = require('./store');
var spellService = require('./spell-service');
var rp = require('request-promise');
var cheerio = require('cheerio');
var gamesArray = [];

var Game = function() {
  this.name = null;
  this.price = null;
  this.imageSrc = null;
  this.link = null;
  this.tags = null;
};

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 80, function() {
  console.log('%s listening to %s', server.name, server.url);
});
// Create connector and listen for messages
var connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});
 server.post('/api/messages', connector.listen());
 server.get('/fb', function(req, res) {
  if (req.query['hub.verify_token'] === 'st34m_cl0v3r_t0k3n') {
     res.send(req.query['hub.challenge']);
   } else {
     res.send('Error, wrong validation token');
   }
});
//server.post('/fb', connector.listen());

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

bot.dialog('FindGamesOfGenre', [
  function(session, args, next) {
    var genreEntity = builder.EntityRecognizer.findEntity(args.intent.entities, 'Genre');
    session.send('We are analyzing your message: \'%s\'', genreEntity.entity);

    getGenreGames(genreEntity.entity,function(data){
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
  matches: 'FindGamesOfGenre',
  onInterrupted: function(session) {
    session.send('Querry genre canceled');
  }
});

bot.dialog('Help', function(session) {
  session.endDialog('Hi! Welcome to SteamGamesBot Try asking me things like \'search rpg\', \'search adventure\' or \'search platformer\'');
}).triggerAction({
  matches: 'Help'
});

// Spell Check
if (process.env.IS_SPELL_CORRECTION_ENABLED === 'true') {
  bot.use({
    botbuilder: function(session, next) {
      spellService
        .getCorrectedText(session.message.text)
        .then(function(text) {
          session.message.text = text;
          next();
        })
        .catch(function(error) {
          console.error(error);
          next();
        });
    }
  });
}

function getGenreGames(genre, result) {
  var url = 'http://store.steampowered.com/tag/en/' + genre +'#p=0&tab=TopSellers';
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
      if(err){
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

const dotenv = require('dotenv');
dotenv.config();
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Tweet generation setup

// Topics
const topics = [
    'Linux',
    'Venture Capitalism',
    'Linus Torvalds',
    'Foundation series',
    'Isaac Asimov',
    'Javascript',
    'Python',
    'iOS',
    'Android',
    'Google',
    'DuckDuckGo',
    'Apple',
    'startups',
    'Silicon Valley',
    'Decentralized Web',
    'OpenAI',
    'Web3',
    'Raspberry Pi',
    'FinTech',
    'Steve Jobs',
    'Bill Gates',
    'HTML',
    'CSS',
    'ReactJS',
    'NodeJS',
    'Dino JS',
    'Tech Culture',
    'Hustle Culture',
    'Clubhouse',
    'Twitter spaces',
    'Tech Jobs',
    'SoyDevs',
    'KickStarter',
    'Y Combinator',
    'Reddit',
    'Ruby on Rails',
    'Hacker News',
    'tech blogging',
    'Mastodon social network',
    'Elon Musk',
    'bitcoin defi',
    'cryptocurrency',
    'trading bots',
    'Twitter bots',
    'Dead Internet Theory',
    'future of transportation',
    'MEAN software stack',
    'SAAS',
    'Software as a service',
    'JAM software stack',
    'MongoDB'
];

// Make it a lil extra
const spice = [
    'use one hashtag',
    'make it funny',
    'use multiple hashtags',
    'mention a famous Twitter user',
    'use a bunch of emojis',
    'promote your blog',
    'try to inspire the audience',
    'talk crap about something random',
    'give a shoutout to a tech youtuber',
    'talk about the joy of being a sentient being',
    'give credit to Elon Musk',
    'threaten to give up on #techtwitter',
    'incorporate a trending topic',
    'brag about achievements in tech',
    'write an unhinged manifesto',
    'advocate for privacy in tech',
    'complain how it does not scale well',
    'say how you will talk internally before getting back to them',
    'say that you will circle back before following up',
    'ask how you can help',
    'ask for references to Twitter threads',
    'mention that it will be a thread'
];

// Random integer generator
function getRandomIntegerInRange(min, max) {
    return Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min)) + min);
}

// Database reference
const dbRef = admin.firestore().doc('tokens/demo');
const dbTweet = admin.firestore().doc('savedTweet/tweet')

// Telegram API init
const TelegramBot = require('node-telegram-bot-api');
const TelegramToken = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TelegramToken, {polling: true});
const convoID = process.env.CONVO_ID; // Telegram user id must match this in order to communicate

// Twitter API init
const TwitterApi = require('twitter-api-v2').default;
const twitterClient = new TwitterApi({
  clientId: process.env.TW_CLIENT_ID,
  clientSecret: process.env.TW_CLIENT_SECRET,
});

const callbackURL = process.env.CALLBACKURL;

// OpenAI API init
const { Configuration, OpenAIApi } = require('openai');
const { topic } = require('firebase-functions/v1/pubsub');
const configuration = new Configuration({
  organization: process.env.OPENAI_ORG,
  apiKey: process.env.OPENAI_KEY,
});
const openai = new OpenAIApi(configuration);

// STEP 1 - Auth URL
exports.auth = functions.https.onRequest(async(request, response) => {
  const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
    callbackURL,
    { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
  );

  // store verifier
  await dbRef.set({ codeVerifier, state });

  response.redirect(url);
});

// STEP 2 - Verify callback code, store access_token 
exports.callback = functions.https.onRequest(async(request, response) => {
  const { state, code } = request.query;

  const dbSnapshot = await dbRef.get();
  const { codeVerifier, state: storedState } = dbSnapshot.data();

  if (state !== storedState) {
    return response.status(400).send('Stored tokens do not match!');
  }

  const {
    client: loggedClient,
    accessToken,
    refreshToken,
  } = await twitterClient.loginWithOAuth2({
    code,
    codeVerifier,
    redirectUri: callbackURL,
  });

  await dbRef.set({ accessToken, refreshToken });

  const { data } = await loggedClient.v2.me(); // start using the client if you want

  response.send("[200] Success!");
});

//
// Telegram Bot Listeners
//

// Generate Tweet and ask if user wants to tweet it
bot.onText(/\/tweet/, async function generateTweet(msg) {

  const chatId = msg.chat.id;

  if (chatId == convoID) {

    // Refresh Twitter token
    const { refreshToken } = (await dbRef.get()).data();
    const {
      client: refreshedClient,
      accessToken,
      refreshToken: newRefreshToken,
    } = await twitterClient.refreshOAuth2Token(refreshToken);
    await dbRef.set({ accessToken, refreshToken: newRefreshToken });
    var { data } = await refreshedClient.v2.me(); // start using the client if you want
    const twitterUser = data['username'];

    // Setup prompt
    var randomNumber1 = getRandomIntegerInRange(0, (topics.length - 1));
    var randomNumber2 = getRandomIntegerInRange(0, (spice.length - 1));
    var payload = 'Tweet something funny about ' + topics[randomNumber1] + ' and ' + spice[randomNumber2]

    // Call OpenAI Content Generation
    const nextTweet = await openai.createCompletion('text-davinci-001', {
      prompt: payload,
      max_tokens: 64,
    });

    const finalTweet = nextTweet.data.choices[0].text + " #AIHotTake";

    // Save Tweet in case user wants to tweet it
    await dbTweet.set({ payload, finalTweet })

    bot.sendMessage(convoID, payload +  finalTweet + "\n\n/send this tweet for " + twitterUser);
  }
  else {
    bot.sendMessage(chatId, "I don't know you.");
  }
});

// Tweet the generated tweet
bot.onText(/\/send/, async function sendTweet(msg) {

  const chatId = msg.chat.id;

  if (chatId == convoID) {
    // Refresh Twitter token
    const { refreshToken } = (await dbRef.get()).data();
    const {
      client: refreshedClient,
      accessToken,
      refreshToken: newRefreshToken,
    } = await twitterClient.refreshOAuth2Token(refreshToken);
    await dbRef.set({ accessToken, refreshToken: newRefreshToken });
    var { data } = await refreshedClient.v2.me(); // start using the client if you want
    const twitterUser = data['username'];

    const { payload, finalTweet } = (await dbTweet.get()).data();

    var { data } = await refreshedClient.v2.tweet(
      finalTweet
    );

    bot.sendMessage(chatId, "Tweet sent on " + twitterUser + "'s account.");
  }
  else {
    bot.sendMessage(chatId, "I don't know you.");
  }
});
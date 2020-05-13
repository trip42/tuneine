const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const port = 23119

const pairs = [
  [ 'Requires Luck', 'Requires Skill' ],
  [ 'Bad Music', 'Good Music' ],
  [ 'Dry', 'Wet' ],
  [ 'Worst Living Person', 'Greatest Living Person' ]
];

const randomElement = function( arr ) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// parse json bodies
app.use( bodyParser.json() );

// store for active games
let games = {};

const getGame = function(code) {
  return games[code];
}

class Game {

  constructor( code ) {
    this.state = 'waitingForPlayers';
    this.round = 0;
    this.code = code;
    this.pair = [];
    this.target = 0;
    this.clue = '';
    this.activePlayer = 0;
    this.activePlayerCode = '';
    this.players = [];
    this.timer = null;
    this.createTime = Date.now();
  }

  setActivePlayer( index ) {
    this.activePlayer = index % this.players.length;
    this.activePlayerCode = this.players[ this.activePlayer ].code;
  }

  startGame() {
    // choose a starting player
    this.setActivePlayer( Math.floor(Math.random() * this.players.length ) );

    // reset the round counter
    this.round = 0;

    // start a round
    this.startRound();
  }

  startRound() {
    this.setState( 'startingRound' );

    // increment the round number
    this.round++;

    // clear player guesses
    for( let i=0; i<this.players.length; i++) {
      this.players[i].guess = null;
      this.players[i].state = 'playing';
    }

    // rotate to the next player
    this.setActivePlayer( this.activePlayer + 1 );

    // set the active players state to giving clue
    this.players[ this.activePlayer ].state = 'giving-clue';

    // pick a new pair of words (maybe this should rotate through the deck)
    this.pair = randomElement( pairs );

    // pick a target
    this.target = Math.floor( Math.random() * 200 ) - 100;

    this.waitForClue();
  }

  waitForClue() {
    // set the state to waiting for clue
    this.setState( 'waitingForClue' );
  }

  setClue( clue ) {
    this.clue = clue;

    this.waitForGuesses();
  }

  waitForGuesses() {
    this.setState(' waitingForGuesses' );

    // start a time
    this.timer = setTimeout(() => {
      this.showScores();
    }, 31000);
  }

  showScores() {
    clearTimeout( this.timer );
    this.setState( 'showingScores' );

    let activePlayer = this.players[ this.activePlayer ];
    let scoreSum = 0;
    let scoreCount = 0;

    // update scores
    for( let playerIndex=0; playerIndex<this.players.length; playerIndex++ ) {
      let player = this.players[ playerIndex ];
      let guess = player.guess;

      if ( guess != null ) {
        if ( guess >= this.target - 2 && guess <= this.target + 2 ) {
          player.score += 4;
          scoreSum += 4
        } else if ( guess >= this.target - 6 && guess <= this.target + 6 ) {
          player.score += 3;
          scoreSum += 3
        } else if ( guess >= this.target - 10 && guess <= this.target + 10 ) {
          player.score += 2;
          scoreSum += 2
        }

        scoreCount ++;
      }
    }

    // the active player receives the average score of all other players
    if ( scoreCount ) {
      activePlayer.score += Math.round( scoreSum / scoreCount );
    }
  }

  setState( newState ) {
    this.state = newState;
  }

  // serialize the game state
  serialize() {
    return {
      code: this.code,
      state: this.state,
      pair: this.pair,
      target: this.target,
      round: this.round,
      activePlayer: this.activePlayer,
      activePlayerCode: this.activePlayerCode,
      players: this.players
    }
  }

  addPlayer(name) {
    let playerCode = Game.generateCode();
    let player = {
      code: playerCode,
      name: name,
      guess: '',
      score: 0
    };

    this.players.push(player);

    return player;
  }

  getPlayer( code ) {
    for( let i=0; i<this.players.length; i++) {
      if ( this.players[i].code === code ) {
        return this.players[i];
      }
    }
    return null;
  }

  setPlayerGuess( playerCode, guess ) {
    if (guess < -100 || guess > 100 ) {
      throw "Invalid Guess"
    }

    let player = this.getPlayer( playerCode );

    if (!player) {
      throw "Invalid Player";
    }

    player.guess = guess;

    // check if all players have submitted
    let allComplete = true;
    for( let i=0; i<this.players.length; i++) {
      let player = this.players[i];
      if ( player.guess == null ) {
        allComplete = false;
        break;
      }
    }

    if (allComplete) {
      this.showScores();
    }
  }

  static generateCode() {
    const vowels = 'AEIOU'.split('');
    const consonants = 'BCDFGHJKMNPQRSTVWXYZ'.split('');

    let code = randomElement( consonants ) +
               randomElement( vowels ) +
               randomElement( consonants ) +
               randomElement( vowels );
    return code;
  }
}

app.use( express.static('static'))

//*** Begin API

// create a new game
app.post( '/game', function( req, res ) {
  let code = '';
  do {
    code = Game.generateCode();
  } while( getGame(code) );
  games[code] = new Game(code);

  res.json( games[code].serialize() );
});

// load an existing game state
app.get( '/game/:code', function( req, res) {
  let code = req.params.code;

  if ( games[code] ) {
    res.send( games[code].serialize() );
  } else {
    res.status(404).json( {error: 'game not found'} );
  }
});

// update a game
app.post( '/game/:code/actions/:action', function( req, res ) {
  let game = getGame( req.params.code);
  let action = req.params.action;

  if ( !game ) {
    res.status(404).json( {error: 'game not found'} );
  }

  switch( action ) {
    case 'startGame':
      game.startGame();
      break;
    case 'startRound':
      game.startRound();
      break;
    case 'submitClue':
      game.setClue( req.body.clue );
      break;
  }

  res.json( game.serialize() );
});

// add a player
app.post( '/game/:code/player', function( req, res ) {
  let game = getGame( req.params.code );
  let player = null;

  if (!game) {
    res.status(404).json( { error: 'Invalid Game' } );
  }

  if (req.body && req.body.name) {
    res.json( game.addPlayer( req.body.name ) );
  } else {
    res.status(400).json( { error: 'Missing Player Name' });
  }
});

// get a player
app.get( '/game/:code/player/:playerCode', function( req, res ) {
  let game = getGame( req.params.code );

  if (!game) {
    res.status(404).json( { error: 'Invalid Game' } );
  }

  let player = game.getPlayer( req.params.playerCode );

  if (!player) {
    res.status( 404 ).json( { error: 'Invalid Player' } );
  }

  res.json( player );
} );

// update a player
app.post( '/game/:code/player/:playerCode/actions/guess', function( req, res ) {
  let game = getGame( req.params.code );

  if (!game) {
    res.status(404).json( { error: 'Invalid Game' } );
  }

  let player = game.getPlayer( req.params.playerCode );

  if (!player) {
    res.status( 404 ).json( { error: 'Invalid Player' } );
  }

  let guess = req.body.guess;

  try {
    guess = parseInt( guess );
    game.setPlayerGuess( player.code, guess );
  } catch( err ) {
    res.status( 400 ).json( { error: 'Invalid Guess' } );
  }

  res.json( player );
});

app.listen( port, () => console.log(`TuneIn listening on port ${port}`) )

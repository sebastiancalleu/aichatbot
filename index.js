// const { google } = require('googleapis');
// const axios = require('axios');
// const { OAuth2Client } = require('google-auth-library');
import readline from 'node:readline';
import fs from 'node:fs';
// const path = require('path');
import OpenAI from "openai";
import _ from 'lodash';
import dotenv from 'dotenv'
dotenv.config()
const openai = new OpenAI({apiKey: process.env.OPENAI_APIKEY});

// 2. Set up Google Calendar API credentials
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const CREDENTIALS_PATH = 'credentials.json'; // Path to your OAuth 2.0 credentials file
const TOKEN_PATH = 'token.json'; // Path to store OAuth 2.0 tokens

// Set up the readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 3. Authenticate with Google API
async function authenticateGoogle() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

  // Check if we have saved the token
  let token;
  if (fs.existsSync(TOKEN_PATH)) {
    token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oauth2Client.setCredentials(token);
  } else {
    token = await getNewToken(oauth2Client);
  }

  return oauth2Client;
}

// 4. Get a new OAuth token if it's not available
async function getNewToken(oauth2Client) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('Authorize this app by visiting this url: ', authUrl);

  return new Promise((resolve, reject) => {
    rl.question('Enter the code from that page here: ', async (code) => {
      try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        resolve(tokens);
      } catch (error) {
        reject('Error while trying to retrieve access token');
      }
    });
  });
}

// 5. Use OpenAI API to parse the user input
async function extractMeetingDetails(userInput, meetingDetails) {
    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        store: true,
        messages: [
            {"role": "assistant", "content": `Extract the meeting details (date, time, participants, and subject) from this sentence: "${userInput}", if one of the is missing ask the user for it. the response to this prompt should be a JSON with the items (date, time, participants, subject, responseToUser) and don't create values if the user doesn't give the precise values, if all the values are present in this object: ${meetingDetails} response with the field responseToUser as an empty string`}
        ]
    });

  return response.choices[0].message.content;
}

// 6. Schedule the meeting using Google Calendar API
async function scheduleMeeting(auth, eventDetails) {
  const calendar = google.calendar({ version: 'v3', auth });

  const event = {
    summary: eventDetails.summary,
    description: eventDetails.description || 'No description',
    start: {
      dateTime: eventDetails.startTime,
      timeZone: 'America/Los_Angeles',
    },
    end: {
      dateTime: eventDetails.endTime,
      timeZone: 'America/Los_Angeles',
    },
    attendees: eventDetails.attendees.map(email => ({ email })),
  };

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });
    console.log('Event created: %s', response.data.htmlLink);
  } catch (error) {
    console.error('Error creating event: ', error);
  }
}

function removeEmptyValues(outputDetails) {
    return _.omitBy(outputDetails, _.isEmpty);
}

function readUntilCommand(meetingDetails) {
    const output = meetingDetails.responseToUser ?? 'Hello how can I help you today ?';
    //hi my name is sebastian and I want to schedule a meeting for tomorrow 15 of february at 10 am in order to get information about the new car
    rl.question(output, async (input) => {
        const outputDetails = await extractMeetingDetails(input, meetingDetails)
        console.log(JSON.parse(outputDetails));
        console.log(meetingDetails);
        meetingDetails = Object.assign(meetingDetails, removeEmptyValues(JSON.parse(outputDetails)));
        console.log(meetingDetails);
        const isMissingData = Object.values(meetingDetails).some((value) => !value);

        if (!isMissingData) {
            console.log('thank you the meeting has been scheduled');
            rl.close(); // Close the readline interface when the stop command is input
        } else {
            readUntilCommand(meetingDetails); // Keep asking for input until the stop command is entered
        }
    });
  }

// 7. Main function to integrate everything
async function main() {
//   const oauth2Client = await authenticateGoogle();
    const meetingDetails = {
        date: '',
        time: '',
        participants: '',
        subject: '',
    }

    readUntilCommand(meetingDetails);
}

main();

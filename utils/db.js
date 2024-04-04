// utils/db.js

// Import MongoDB client
import { MongoClient } from 'mongodb';

class DBClient {
  constructor() {
    // MongoDB connection parameters
    this.host = process.env.DB_HOST || 'localhost';
    this.port = process.env.DB_PORT || 27017;
    this.database = process.env.DB_DATABASE || 'files_manager';
    this.url = `mongodb://${this.host}:${this.port}`;
    this.client = new MongoClient(this.url, { useUnifiedTopology: true });
    this.client.connect();
    this.db = this.client.db(this.database);
  }

  async isAlive() {
    // Check if MongoDB client is connected
    return !!this.client && !!this.client.isConnected();
  }

  async nbUsers() {
    // Count number of documents in 'users' collection
    return this.db.collection('users').countDocuments();
  }

  async nbFiles() {
    // Count number of documents in 'files' collection
    return this.db.collection('files').countDocuments();
  }
}

// Create and export an instance of DBClient
const dbClient = new DBClient();
module.exports = dbClient;

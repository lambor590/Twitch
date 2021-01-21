const config = require('./config.json');
const TwitchApi = require('./twitch-api');
const MiniDb = require('./minidb');
const moment = require('moment');

class TwitchMonitor {
    static __init() {
        this._userDb = new MiniDb("twitch-users");

        this._lastUserRefresh = this._userDb.get("last-update") || null;
        this._pendingUserRefresh = false;
        this._userData = this._userDb.get("user-list") || { };

        this._pendingGameRefresh = false;
        this._watchingGameIds = [];
    }

    static start() {
        // Load channel names from config
        this.channelNames = [];
        config.twitch_channels.split(',').forEach((channelName) => {
            if (channelName) {
                this.channelNames.push(channelName.toLowerCase());
            }
        });
        if (!this.channelNames.length) {
            console.warn('[TwitchMonitor]', 'No channels configured');
            return;
        }

        // Configure polling interval
        let checkIntervalMs = parseInt(config.twitch_check_interval_ms);
        if (isNaN(checkIntervalMs) || checkIntervalMs < TwitchMonitor.MIN_POLL_INTERVAL_MS) {
            // Enforce minimum poll interval to help avoid rate limits
            checkIntervalMs = TwitchMonitor.MIN_POLL_INTERVAL_MS;
        }
        setInterval(() => {
            this.refresh("Periodic refresh");
        }, checkIntervalMs + 1000);

        // Immediate refresh after startup
        setTimeout(() => {
            this.refresh("Initial refresh after start-up");
        }, 1000);

        // Ready!
        console.log('[TwitchMonitor]', `Configured stream status polling for channels:`, this.channelNames.join(', '),
          `(${checkIntervalMs}ms interval)`);
    }

    static refresh(reason) {
        const now = moment();
        console.log('[Twitch]', ' ▪ ▪ ▪ ▪ ▪ ', `Refreshing now (${reason ? reason : "No reason"})`, ' ▪ ▪ ▪ ▪ ▪ ');

        // Refresh all users periodically
        if (this._lastUserRefresh === null || now.diff(moment(this._lastUserRefresh), 'minutes') >= 10) {
            TwitchApi.fetchUsers(this.channelNames)
              .then((users) => {
                  this.handleUserList(users);
              })
              .catch((err) => {
                  console.warn('[TwitchMonitor]', 'Error in users refresh:', err);
              })
              .then(() => {
                  if (this._pendingUserRefresh) {
                      this._pendingUserRefresh = false;
                  }
              })
        }

        // Refresh all streams
        if (!this._pendingUserRefresh && !this._pendingGameRefresh) {
            TwitchApi.fetchStreams(this.channelNames)
              .then((channels) => {
                  this.handleStreamList(channels);
              })
              .catch((err) => {
                  console.warn('[TwitchMonitor]', 'Error in streams refresh:', err);
              });
        }
    }

    static handleUserList(users) {
        let gotChannelNames = [];

        users.forEach((user) => {
            const channelName = user.login.toLowerCase();

            let prevUserData = this._userData[channelName] || { };
            this._userData[channelName] = Object.assign({ }, prevUserData, user);

            gotChannelNames.push(user.display_name);
        });

        if (gotChannelNames.length) {
            console.debug('[TwitchMonitor]', 'Updated user info:', gotChannelNames.join(', '));
        }

        this._lastUserRefresh = moment();

        this._userDb.put("last-update", this._lastUserRefresh);
        this._userDb.put("user-list", this._userData);
    }

    static handleStreamList(streams) {
        // Index channel data & build list of stream IDs now online
        let nextOnlineList = [];

        streams.forEach((stream) => {
            const channelName = stream.user_name.toLowerCase();

            if (stream.type === "live") {
                nextOnlineList.push(channelName);
            }

            let userDataBase = this._userData[channelName] || { };
            let prevStreamData = this.streamData[channelName] || { };

            this.streamData[channelName] = Object.assign({ }, userDataBase, prevStreamData, stream);
            });

        // Find channels that are now online, but were not before
        let notifyFailed = false;
        let anyChanges = false;

        for (let i = 0; i < nextOnlineList.length; i++) {
            let _chanName = nextOnlineList[i];

            if (this.activeStreams.indexOf(_chanName) === -1) {
                // Stream was not in the list before
                console.log('[TwitchMonitor]', 'Stream channel has gone online:', _chanName);
                anyChanges = true;
            }

            if (!this.handleChannelLiveUpdate(this.streamData[_chanName], true)) {
                notifyFailed = true;
            }
        }

        // Find channels that are now offline, but were online before
        for (let i = 0; i < this.activeStreams.length; i++) {
            let _chanName = this.activeStreams[i];

            if (nextOnlineList.indexOf(_chanName) === -1) {
                // Stream was in the list before, but no longer
                console.log('[TwitchMonitor]', 'Stream channel has gone offline:', _chanName);
                this.streamData[_chanName].type = "detected_offline";
                this.handleChannelOffline(this.streamData[_chanName]);
                anyChanges = true;
            }
        }

        if (!notifyFailed) {
            // Notify OK, update list
            this.activeStreams = nextOnlineList;
        } else {
            console.log('[TwitchMonitor]', 'Could not notify channel, will try again next update.');
        }
    }

    static handleChannelLiveUpdate(streamData, isOnline) {
        for (let i = 0; i < this.channelLiveCallbacks.length; i++) {
            let _callback = this.channelLiveCallbacks[i];

            if (_callback) {
                if (_callback(streamData, isOnline) === false) {
                    return false;
                }
            }
        }

        return true;
    }

    static handleChannelOffline(streamData) {
        this.handleChannelLiveUpdate(streamData, false);

        for (let i = 0; i < this.channelOfflineCallbacks.length; i++) {
            let _callback = this.channelOfflineCallbacks[i];

            if (_callback) {
                if (_callback(streamData) === false) {
                    return false;
                }
            }
        }

        return true;
    }

    static onChannelLiveUpdate(callback) {
        this.channelLiveCallbacks.push(callback);
    }

    static onChannelOffline(callback) {
        this.channelOfflineCallbacks.push(callback);
    }
}

TwitchMonitor.activeStreams = [];
TwitchMonitor.streamData = { };

TwitchMonitor.channelLiveCallbacks = [];
TwitchMonitor.channelOfflineCallbacks = [];

TwitchMonitor.MIN_POLL_INTERVAL_MS = 30000;

module.exports = TwitchMonitor;

TwitchMonitor.__init();
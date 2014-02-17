var SCRIPT_ID = (function () {
        if (!ScriptProperties.getProperty("id")) {
            throw "プロジェクト プロパティの『id』を設定してください";
        }

        return ScriptProperties.getProperty("id");
    })(),
    SCRIPT_URL = ScriptApp.getService().getUrl(),
    API_BASE   = "https://api.twitter.com",
    API_EXT    = ".json",
    API_PATH   = {
        "OAUTH" : {
            "ACCESS_TOKEN"  : API_BASE + "/oauth/access_token",
            "REQUEST_TOKEN" : API_BASE + "/oauth/request_token",
            "AUTHORIZATION" : API_BASE + "/oauth/authorize"
        },
        "PROFILE"   : API_BASE + "/1.1/users/show"         + API_EXT,
        "FOLLOW"    : API_BASE + "/1.1/friendships/create" + API_EXT,
        "FOLLOWING" : API_BASE + "/1.1/friends/list"       + API_EXT,
        "FOLLOWERS" : API_BASE + "/1.1/followers/list"     + API_EXT
    },
    followList = [],
    followersCount, userProps;

function each(collection, iterator) {
    var i = 0,
        len, ary, key;

    if (Array.isArray(collection)) {
        len = collection.length;

        for (; len; ++i, --len) {
            iterator(collection[i], i);
        }
    }
    else {
        ary = Object.keys(collection);
        len = ary.length;

        for (; len; ++i, --len) {
            key = ary[i];
            iterator(key, collection[key]);
        }
    }
}

function getProp(key) {
    if (!key) {
        return;
    }

    var ret = null;

    if (userProps && userProps[key]) {
        ret = userProps[key];
    }
    else if (UserProperties.getProperty(SCRIPT_ID)) {
        ret = JSON.parse(UserProperties.getProperty(SCRIPT_ID))[key];
    }

    return ret;
}

function setProps(params) {
    if (!params) {
        return;
    }

    if (!userProps) {
        userProps = UserProperties.getProperty(SCRIPT_ID) ?
                            JSON.parse(UserProperties.getProperty(SCRIPT_ID)) :
                            {}
                    ;
    }

    each(params, function (key, value) {
        userProps[key] = value;
    });

    UserProperties.setProperty(SCRIPT_ID, JSON.stringify(userProps));
}

function oAuthConfig() {
    var oAuthConfig = UrlFetchApp.addOAuthService("twitter");

    oAuthConfig.setAccessTokenUrl(API_PATH.OAUTH.ACCESS_TOKEN);
    oAuthConfig.setRequestTokenUrl(API_PATH.OAUTH.REQUEST_TOKEN);
    oAuthConfig.setAuthorizationUrl(API_PATH.OAUTH.AUTHORIZATION);

    oAuthConfig.setConsumerKey(consumerKey);
    oAuthConfig.setConsumerSecret(consumerSecret);

}

function getFollowers() {
    oAuthConfig();

    var options = {
        oAuthServiceName : "twitter",
        oAuthUseToken    : "always",
        method           : "GET"
    },
    response = UrlFetchApp.fetch(API_PATH.FOLLOWERS, options),
    result;

    if (response.getResponseCode() === 200) {
        result = JSON.parse(response.getContentText());

        extractNoFollowList(result.users);
    }
    else {
        throw "error: response code=" + response.getResponseCode();
    }
}

function extractNoFollowList(users) {
    var data, db, record;

    if (!users) {
        return;
    }

    each(users, function (user) {
        if (!user.following) {
            data = {
                "id"          : user.id,
                "name"        : user.name,
                "screen_name" : user.screen_name,
                "description" : user.description
            };

            followList.push(data);
        }
    });

    db     = ScriptDb.getMyDb();
    record = db.save({
        "latest_run"  : Date.now(),
        "follow_list" : followList
    });

    UserProperties.setProperty("db_id", record.getId());
}

function readDataFromDB() {
    var id = UserProperties.getProperty("db_id"),
        db = ScriptDb.getMyDb();

    Logger.log(db.load(id));
}


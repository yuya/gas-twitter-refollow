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
    screenName     = "***",
    consumerKey    = "***",
    consumerSecret = "***",
    followList     = [],
    followersList  = [],
    dailyFollowLimit, nextCursor, userProps;

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

function setProp(key, value) {
    if (!params) {
        return;
    }

    if (!userProps) {
        userProps = UserProperties.getProperty(SCRIPT_ID) ?
                            JSON.parse(UserProperties.getProperty(SCRIPT_ID)) :
                            {}
                    ;
    }

    userProps[key] = value;
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

function getFollowersCount() {
    var params, options, result;

    oAuthConfig();

    params  = { "screen_name" : screenName };
    options = {
        oAuthServiceName : "twitter",
        oAuthUseToken    : "always",
        method           : "GET"
    };

    url      = gerUrlWithParams(API_PATH.PROFILE, params);
    response = UrlFetchApp.fetch(url, options);

    if (response.getResponseCode() === 200) {
        result = JSON.parse(response.getContentText());

        return result.followers_count;
    }
    else {
        throw "error: response code=" + response.getResponseCode();
    }
}

function getFollowLimit(followersCount) {
    if (!followersCount) {
        return;
    }

    if (followersCount <= 99) {
        followLimit =  7;
    }
    else if (   99 < followersCount && followersCount <=  1000) {
        followLimit = 24;
    }
    else if ( 1000 < followersCount && followersCount <= 10000) {
        followLimit = 39;
    }
    else if (10000 < followersCount) {
        followLimit = 77;
    }

    return followLimit;
}

function gerUrlWithParams(url, params) {
    if (!url || !params) {
        return;
    }

    var ret = [];

    each(params, function (key, value) {
        ret.push(key + "=" + encodeURIComponent(value));
    });

    return url + "?" + ret.join("&");
}

function getFollowers(cursor) {
    var params, options, url, response, result;

    oAuthConfig();

    params  = { "count" : 200 };
    options = {
        oAuthServiceName : "twitter",
        oAuthUseToken    : "always",
        method           : "GET"
    };

    if (cursor) {
        params["cursor"] = cursor;
    }

    url      = gerUrlWithParams(API_PATH.FOLLOWERS, params);
    response = UrlFetchApp.fetch(url, options);

    if (response.getResponseCode() === 200) {
        result     = JSON.parse(response.getContentText());
        nextCursor = result.next_cursor;

        followersList.push(result.users);

        if (!nextCursor) {
            extractNotFollowingList(followersList);
        }
        else {
            getFollowers(nextCursor);
        }
    }
    else {
        throw "error: response code=" + response.getResponseCode();
    }
}

function validateNGWords(data) {
    var ret = true,
        accountRe, textRe, regexp;

    if (!data) {
        return;
    }

    accountRe = /_bot$/i;
    textRe    = /BOT|ＢＯＴ|ｂｏｔ|ボット|ﾎﾞｯﾄ/ig;

    each(data, function (key, value) {
        switch (key) {
        case "id":
        case "screen_name":
            regexp = accountRe;
            break;
        case "name":
        case "description":
            regexp = textRe;
            break;
        }

        if (regexp.test(value)) {
            ret = false;
        }
    });

    return ret;
}

function extractNotFollowingList(users) {
    if (!users) {
        return;
    }

    var db = ScriptDb.getMyDb(),
        data, record;

    each(users, function (user) {
        if (!user.following) {
            data = {
                "id"          : user.id,
                "name"        : user.name,
                "screen_name" : user.screen_name,
                "description" : user.description
            };

            if (validateNGWords(data)) {
                followList.push(data);
            }
        }
    });

    record = db.save({
        "latest_run"  : Date.now(),
        "follow_list" : followList
    });

    setProp("db_id", record.getId());
}

function followUserById(id) {
    var params, options, url, response, result;

    if (!id) {
        return;
    }

    oAuthConfig();

    params  = { "user_id" : id };
    options = {
        oAuthServiceName : "twitter",
        oAuthUseToken    : "always",
        method           : "POST"
    };

    url      = gerUrlWithParams(API_PATH.FOLLOW, params);
    response = UrlFetchApp.fetch(url, options);

    if (response.getResponseCode() === 200) {
        result = JSON.parse(response.getContentText());

        return result.following ? true : false;
    }
    else {
        throw "error: response code=" + response.getResponseCode();
    }
}

function doFollowFromList() {
    var db = ScriptDb.getMyDb(),
        followList, targetUserId, randSecond;

    if (!db) {
        return;
    }

    followList   = db.load(getProp("db_id"))["follow_list"];
    targetUserId = followList.pop();
    randSecond   = 1000 * 60 * (Math.floor(Math.random () * 60) + 1);

    // 手作業感を更に演出してる風
    Utilities.sleep(randSecond);
    followUserById(targetUserId);
}

function resetFollowTimer() {
    var followersCount = getFollowersCount(),
        followLimit    = getFollowLimit(followersCount),
        triggers       = ScriptApp.getProjectTriggers(),
        triggerName    = "doFollowFromList",
        timeTrigger    = ScriptApp.newTrigger(triggerName).timeBased(),
        oneday         = 1000 * 60 * 60 * 24,
        interval       = Math.round(oneday / (1000 * 60 * 60 * followLimit));

    each(triggers, function (trigger) {
        if (trigger.getHandlerFunction() === triggerName) {
            ScriptApp.deleteTrigger(trigger);
        }
    });

    createFollowTimer(interval);
}

function createFollowTimer(interval, timeAmount) {
    if (!interval) {
        return;
    }

    var triggerName = "doFollowFromList",
        timeTrigger = ScriptApp.newTrigger(triggerName).timeBased();

    return timeTrigger.after(interval).create();
}

function initInterval() {
    var triggers    = ScriptApp.getProjectTriggers(),
        triggerName = "resetFollowTimer",
        timeTrigger = ScriptApp.newTrigger(triggerName).timeBased();

    each(triggers, function (trigger) {
        if (trigger.getHandlerFunction() === triggerName) {
            ScriptApp.deleteTrigger(trigger);
        }
    });

    timeTrigger.everyDays(1).create();
}


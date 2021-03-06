angular.module('pictifyApp.facebook', [])
    .factory('facebook', ['$q', '$kinvey', '$location', '$rootScope', '$http', 'kinveyConfig', function ($q, $kinvey, $location, $rootScope, $http, kinveyConfig) {

        function getLoginStatus() {
            let deferred = $q.defer();
            FB.getLoginStatus(function (response) {
                if (response.status === 'connected') {
                    return deferred.resolve(response.authResponse);
                }
                FB.login(function (response) {
                    deferred.resolve(response.authResponse);
                });
            });
            return deferred.promise;
        }

        function getProfilePicture(userId) {
            let deferred = $q.defer();
            FB.api(
                "/" + userId + "/picture?width=300&height=300",
                function (response) {
                    if (response && !response.error) {
                        deferred.resolve(response);
                    }
                    else {
                        deferred.reject('Error occured');
                    }
                });
            return deferred.promise;
        }

        function updateUserInfo(key, value) {
            let user = $kinvey.getActiveUser();
            user[key] = value;
            let promise = $kinvey.User.update(user);
            promise.then(function (user) {
                console.log("Update user info after:");
                console.log(user);
            }, function (err) {
                console.log(err);
            });

            return promise;
        }

        function facebookLogin() {
            getLoginStatus()
                .then(function (authResponse) {
                    let provider = 'facebook';
                    let tokens = {
                        'access_token': authResponse.accessToken,
                        'expires_in': authResponse.expiresIn
                    };
                    return $kinvey.User.loginWithProvider(provider, tokens).then(
                        function (success) {
                            console.log(success);
                            console.log("successful login with facebook");

                            $rootScope.currentUser = $kinvey.getActiveUser();
                            console.log($rootScope.currentUser);

                            return $rootScope.currentUser;

                        }, function (err) {
                            // Attempt to signup as a new user if no user with the identity exists.
                            if ($kinvey.Error.USER_NOT_FOUND === err.name) {
                                console.log("first login with facebook -> registration procedure");

                                return $kinvey.User.signupWithProvider(provider, tokens)
                                    .then(function (user) {
                                            return getProfilePicture(user._socialIdentity.facebook.id)
                                                .then(function (imageData) {
                                                    console.log(imageData);
                                                    let profilePicUrl = imageData.data.url;
                                                    console.log(profilePicUrl);

                                                    return $http.get(profilePicUrl, {responseType: "blob"})
                                                        .then(function (response) {
                                                            console.log("https response");
                                                            console.log(response);
                                                            let profImageBlob = response.data;
                                                            return kinveyConfig.authorize
                                                                .then(function () {
                                                                    return $kinvey.File.upload(profImageBlob, {
                                                                        mimeType: profImageBlob.type,
                                                                        size: profImageBlob.size,
                                                                        _acl: {
                                                                            gr: true,
                                                                            gw: false
                                                                        }
                                                                    }, {public: true})
                                                                        .then(function (success) {
                                                                            console.log("upload success");
                                                                            console.log(success);
                                                                            return success._id;
                                                                        }, function (error) {
                                                                            console.log(error);
                                                                        })
                                                                        .then(function (imageId) {
                                                                            // Open comments, likes and dislike for pic
                                                                            return $kinvey.DataStore.save('pictures', {
                                                                                image: {
                                                                                    _type: "KinveyFile",
                                                                                    _id: imageId
                                                                                },
                                                                                _acl: {
                                                                                    gr: true,
                                                                                    gw: true
                                                                                },
                                                                                comments: [],
                                                                                votes: {
                                                                                    likes: [],
                                                                                    dislikes: []
                                                                                },
                                                                                caption: ''
                                                                            }, {public: true})
                                                                                .then(function (picture) {
                                                                                    console.log("picture");
                                                                                    console.log(picture);
                                                                                    // Update user and return him
                                                                                    let rawFacebookName = user._socialIdentity.facebook.name;
                                                                                    let facebookUsernameParts = rawFacebookName.toLowerCase().split(' ');
                                                                                    let facebookUsernameReady = facebookUsernameParts.join(".");

                                                                                    user.username = facebookUsernameReady;
                                                                                    user.profile_picture = picture._id;
                                                                                    let profilePicture = {
                                                                                        _id: picture._id,
                                                                                    };
                                                                                    user.profilePicture = profilePicture; // prof pic ref
                                                                                    user.fullname = user._socialIdentity.facebook.name;
                                                                                    user.followersCount = 0;
                                                                                    user.followingCount = 0;

                                                                                    let social = {
                                                                                        _id: user._id,
                                                                                        _acl: {
                                                                                            gr: true,
                                                                                            gw: true
                                                                                        },
                                                                                        followers: {},
                                                                                        following: {}
                                                                                    };

                                                                                    $kinvey.DataStore.save("socials", social)
                                                                                        .then(function (success) {
                                                                                            console.log(success);
                                                                                        }, function (error) {
                                                                                            console.log(error);
                                                                                        });

                                                                                    return $kinvey.User.update(user, {
                                                                                        exclude: ['profilePicture'],
                                                                                        relations: {
                                                                                            profilePicture: "pictures",
                                                                                        }
                                                                                    })
                                                                                        .then(function (updatedUser) {
                                                                                            $rootScope.currentUser = updatedUser;
                                                                                            console.log("updatedUser: ");
                                                                                            console.log(updatedUser);
                                                                                            console.log("finished successfully");
                                                                                            return updatedUser;
                                                                                        }, function (error) {
                                                                                            console.log(error)
                                                                                        });
                                                                                }, function (error) {
                                                                                    console.log(error);
                                                                                });
                                                                        })
                                                                });
                                                        })
                                                }, function (error) {
                                                    console.log("http response error!:");
                                                    console.log(error);
                                                });
                                        }
                                    );
                            }
                            return $kinvey.Defer.reject(err);
                        });
                })
                .then(function (user) {
                        if (user) {
                            console.log("user before path change");
                            console.log(user);
                            $rootScope.currentUser = user;
                            console.log("changing path to profile from landing");
                            $location.path("/profile");
                        } else {
                            console.log("no user passed down so fuck off")
                        }
                    },
                    function (error) {
                        console.log(error);
                    });
        }

        return {
            getProfilePicture: getProfilePicture,
            updateUserInfo: updateUserInfo,
            getLoginStatus: getLoginStatus,
            facebookLogin: facebookLogin
        }
    }]);
var exec = require('child_process').exec;
var fs = require('fs');
var config = require('./release-config.json');

var path = require('path');
var appDir = path.dirname(require.main.filename);

var installDependencies = 'npm i --save-dev prompt-confirm xml2js';
execute(installDependencies, function () {
    var Confirm = require('prompt-confirm');
    checkPrerequisites();
    updatePackageJson();
    addPlatform();
    updateConfigXML();
    buildReleaseAndoid();
});

function execute(command, callback) {
    if (!callback) {
        callback = function () {
        };
    }
    exec(command, function (error, stdout, stderr) {
        callback(stdout);
    });
}


function checkPrerequisites() {
    if (!fs.existsSync(config.RELEASE_FOLDER)) {
        console.log('Creating folders');
        fs.mkdirSync(config.RELEASE_FOLDER);
        fs.mkdirSync(config.RELEASE_FOLDER + '/latest_release');
    }


    if (!fs.existsSync(config.KEYSTORE_NAME)) {
        createKeyStore();
    }
}

function generatePassword() {
    var text = '';
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 32; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

function getKeystoreCommand() {
    var command = 'keytool -genkey -v ';
    command += '-keystore ' + config.KEYSTORE_NAME;
    command += ' -alias ' + config.APP_NAME + ' -keyalg RSA -keysize 2048 -validity 10000 ';
    command += '-storepass ' + config.KEYSTORE_PASSWORD;
    command += ' -dname "CN=' + config.FULL_NAME + ', OU=' + config.ORGANIZAtIONAL_UNIT + ', O=' + config.ORGANIZATION + ', L=' + config.CITY + ', S=' + config.STATE + ', C=' + config.COUNTRY_CODE + '"';
    command += ' -keypass ' + config.KEYSTORE_PASSWORD;
    return command;
}

function createKeyStore() {
    const prompt = new Confirm('No keystore file was found. Do you want to create one now?');
    prompt.run()
        .then(function (confirm) {
            if (confirm) {
                var command = getKeystoreCommand();
                console.log('Keystore was created!');
                // console.log('\n-----> Please memorize <-----');
                // console.log('Password (storepass & keypass):', config.KEYSTORE_PASSWORD);
                // console.log('-----------------------------');
                execute(command);
            }
        });
}

function updatePackageJson() {
    var file = require(config.packageJsonPath);

    const year = (new Date().getFullYear() + '').slice(-2);
    const month = ('0' + (new Date().getMonth() + 1)).slice(-2);
    const day = ('0' + new Date().getDate()).slice(-2);
    const hours = ('0' + new Date().getHours()).slice(-2);
    const minutes = ('0' + new Date().getMinutes()).slice(-2);


    file.version = "0.0." + year + month + day + hours + minutes;


    fs.writeFile('package.json', JSON.stringify(file, null, 2), function (err) {
        if (err) return console.log(err);
        console.log('Updated package.json Version number ' + file.version);
    });
}

function addPlatform() {
    if (!fs.existsSync(config.ANDROID_PLATFORM_PATH)) {
        console.log('Android platform is not available. Please check ', config.ANDROID_PLATFORM_PATH);

        //     console.log('Adding android platform. This might take a while...');
        //     var error = function (error) {
        //         if (error) {
        //             console.log(err);
        //         }
        //     };
        //     execute('ionic cordova platform add android', null, error);
    }
}

function updateConfigXML() {
    if (!fs.existsSync('./config.xml')) {
        console.log('Cannot find config.xml. Please check if the android platform is added. Otherwise run:');
        console.log('ionic cordova platform add android');
    } else {
        var parseString = require('xml2js').parseString,
            xml2js = require('xml2js');
        var packageJSON = require(config.packageJsonPath);


        fs.readFile(config.CONFIG_XML_PATH, {encoding: 'utf-8'}, function (err, data) {
            if (err) console.log(err);

            // we then pass the data to our method here
            parseString(data, function (err, result) {
                if (err) console.log(err);
                // here we log the results of our xml string conversion

                var json = result;

                var versionCode = +json.widget['$']['android-versionCode'];
                json.widget['$']['android-versionCode'] = !!versionCode ? ++versionCode : 1;
                json.widget['$']['version'] = packageJSON.version;

                // create a new builder object and then convert
                // our json back to xml.
                var builder = new xml2js.Builder();
                var xml = builder.buildObject(json);

                fs.writeFile(config.CONFIG_XML_PATH, xml, function (err, data) {
                    if (err) console.log(err);

                    console.log("successfully written our update xml to file (Version Code " + json.widget['$']['android-versionCode'] + ")");
                })

            });
        });
    }
}

function buildReleaseAndoid() {
    console.log('Building release apk. This might take a while.');
    var cmd = 'ionic cordova build --prod --release --aot --minifyjs --optimizejs --minifycss --debug android';
    execute(cmd, function (p1, p2) {
        console.log('Release APK has been created!');
        signAPK();
    });
}

function signAPK() {
    if (!fs.existsSync(config.UNSIGNED_APK_PATH)) {
        console.log('Could not find the unsigned apk. Please change the field UNSIGNED_APK_PATH in the release-config.json and run this script again.');
    } else {
        var cmd = 'jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore ' + config.KEYSTORE_NAME + ' -storepass ' + config.KEYSTORE_PASSWORD + ' ' + config.UNSIGNED_APK_PATH + ' ' + config.APP_NAME;
        console.log('Singing apk...');
        execute(cmd, function () {
            console.log('...Finished!');
            zipAndCopy();
        });
    }
}

function zipAndCopy() {
    var packageJSON = require(config.packageJsonPath);

    var cmd = config.ZIPALIGN_PATH + ' -v 4 ' + config.UNSIGNED_APK_PATH + ' ' + config.RELEASE_FOLDER + '/latest_release/' + config.APP_NAME + '_' + packageJSON.version + '.apk';
    console.log('Zip and copy...');
    execute(cmd, function () {
        console.log('Finished!');
    });

}

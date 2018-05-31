'use strict';

const xml = require('xml');
const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const zip = new JSZip();
const request = require('request')

const buildJsonResults = require('./utils/buildJsonResults');
const getOptions = require('./utils/getOptions');

const reportUrl = process.env.report_url
const reportProject = process.env.report_project
const reportToken = process.env.report_token
const buildNumber = process.env.BUILD_NUMBER;

/*
  At the end of ALL of the test suites this method is called
  It's responsible for generating a single junit.xml file which
  Represents the status of the test runs

  Expected input and workflow documentation here:
  https://facebook.github.io/jest/docs/configuration.html#testresultsprocessor-string

  Intended output (junit XML) documentation here:
  http://help.catchsoftware.com/display/ET/JUnit+Format
*/
module.exports = (report) => {
  const options = getOptions.options();
  const jsonResults = buildJsonResults(report, fs.realpathSync(process.cwd()), options);

  // Ensure output path exists
  mkdirp.sync(path.join(process.cwd(), options.output));
  // Write data to file
  const xmlReport = xml(jsonResults, { indent: '  ' })
  zip
    .file("report.xml", Buffer.from(xmlReport))
    .generateNodeStream({ type: 'nodebuffer', streamFiles: true })
    .pipe(fs.createWriteStream(`${options.output}/report${buildNumber || ''}.zip`))
    .on('finish', function () {
      console.log("zip file saved.");
      if (reportUrl && reportProject && reportToken) {
        const reqOptions = {
          method: "POST",
          uri: `${reportUrl}/api/v1/${reportProject}/launch/import`,
          headers: {
            "Authorization": `bearer ${reportToken}`
          },
          formData: {
            file: fs.createReadStream(`${options.output}/report.zip`)
          }
        };
        request.post(reqOptions, function optionalCallback(err, httpResponse, body) {
          if (err) {
            return console.error('upload failed:', err);
          }
          console.log('Upload successful!  Server responded with:', body);
        });
      }
    });

  // Jest 18 compatibility
  return report;
};

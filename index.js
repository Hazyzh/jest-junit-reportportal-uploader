'use strict';

const xml = require('xml');
const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const zip = new JSZip();
const request = require('request')
const jestValidate = require('jest-validate');

const buildJsonResults = require('./utils/buildJsonResults');
const getOptions = require('./utils/getOptions');

const reportUrl = process.env.report_url
const reportProject = process.env.report_project
const reportToken = process.env.report_token
const processor = (report, reporterOptions = {}) => {
  // If jest-junit is used as a reporter allow for reporter options
  // to be used. Env and package.json will override.
  const options = getOptions.options(reporterOptions);

  const jsonResults = buildJsonResults(report, fs.realpathSync(process.cwd()), options);

  // Ensure output path exists
  mkdirp.sync(path.join(process.cwd(), options.output));


  // Write data to file
  const xmlReport = xml(jsonResults, { indent: '  ' })
  zip
    .file("report.xml", Buffer.from(xmlReport))
    .generateNodeStream({ type: 'nodebuffer', streamFiles: true })
    .pipe(fs.createWriteStream(`${options.output}/report.zip`))
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


// This is an old school "class" in order
// for the constructor to be invoked statically and via "new"
// so we can support both testResultsProcessor and reporters
// TODO: refactor to es6 class after testResultsProcessor support is removed
function JestJUnit (globalConfig, options) {
  // See if constructor was invoked statically
  // which indicates jest-junit was invoked as a testResultsProcessor
  // and show deprecation warning

  if (globalConfig.hasOwnProperty('testResults')) {
    const newConfig = JSON.stringify({
      reporters: ['jest-junit']
    }, null, 2);

    jestValidate.logValidationWarning('testResultsProcessor support is deprecated. Please use jest reporter. See https://github.com/jest-community/jest-junit#usage', newConfig);
    return processor(globalConfig);
  }

  this._globalConfig = globalConfig;
  this._options = options;

  this.onRunComplete = (contexts, results) => {
    processor(results, this._options);
  };
}

module.exports = JestJUnit;


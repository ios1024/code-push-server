'use strict';
var Q = require('q');
var Promise = Q.Promise;
var models = require('../../models');
var _ = require('lodash');
var config    = _.get(require('../config'), 'qiniu', {});

var proto = module.exports = function (){
  function ClientManager() {

  }
  ClientManager.__proto__ = proto;
  return ClientManager;
};

proto.updateCheck = function(deploymentKey, appVersion, label, packageHash) {
  return Promise(function (resolve, reject, notify) {
    var rs = {
      downloadURL: "",
      description: "",
      isAvailable: false,
      isMandatory: false,
      appVersion: "1.0.1",
      packageHash: "",
      label: "",
      packageSize: 0,
      updateAppVersion: false
    };
    if (_.isEmpty(deploymentKey) || _.isEmpty(appVersion)) {
      throw Error("please input deploymentKey and appVersion");
    }
    return models.Deployments.findOne({where: {deployment_key: deploymentKey}}).then(function (data) {
      if (_.isEmpty(data)) {
        throw Error('does not found deployment');
      }
      return models.DeploymentsVersions.findOne({where: {deployment_id:data.id, app_version: appVersion}});
    }).then(function (deploymentsVersions) {
      var packageId = _.get(deploymentsVersions, 'current_package_id', 0);
      if (_.isEmpty(deploymentsVersions) || _.eq(packageId, 0) ) {
        return;
      }
      return models.Packages.findById(packageId).then(function (packages) {
        if (!_.isEmpty(packages) && !_.eq(_.get(packages, 'package_hash', ""), packageHash)) {
          rs.downloadURL = _.get(config, 'downloadUrl') + '/' + _.get(packages,'blob_url');
          rs.description = _.get(packages, 'description', '');
          rs.isAvailable = true;
          rs.isMandatory = _.eq(deploymentsVersions.is_mandatory, 1) ? true : false;
          rs.appVersion = appVersion;
          rs.packageHash = _.get(packages, 'package_hash', '');
          rs.label = _.get(packages, 'label', '');
          rs.packageSize = _.get(packages, 'size', 0);
          rs.updateAppVersion = false;
        }
      });
    }).then(function () {
      resolve(rs);
    }).catch(function (e) {
      reject(e);
    });
  });
};

proto.getPackagesInfo = function (deploymentKey, label) {
  return Promise(function (resolve, reject, notify) {
    if (_.isEmpty(deploymentKey) || _.isEmpty(label)) {
      throw Error("please input deploymentKey and appVersion");
    }
    return models.Deployments.findOne({where: {deployment_key: deploymentKey}}).then(function (data) {
      if (_.isEmpty(data)) {
        throw Error('does not found deployment');
      }
      return models.Packages.findOne({where: {deployment_id:data.id, label: label}});
    }).then(function (packages) {
      if (_.isEmpty(packages)) {
        throw Error('does not found packages');
      }
      resolve(packages);
    }).catch(function (e) {
      reject(e);
    });
  });
};

proto.reportStatusDownload = function(deploymentKey, label, clientUniqueId) {
  return this.getPackagesInfo(deploymentKey, label).then(function (packages) {
    return models.PackagesMetrics.addOneOnDownloadById(packages.id);
  });
};

// {
//   "appVersion": "1.0.1",
//   "deploymentKey": "V7WEMbiAUsXSyxIiACvinfSnz3Lu4ksvOXqog",
//   "clientUniqueId": "5696269B-256B-4F18-8237-DEA9AF5C1662",
//   "label": "v13",
//   "status": "DeploymentSucceeded", //DeploymentFailed
//   "previousLabelOrAppVersion": "1.0.1",
//   "previousDeploymentKey": "V7WEMbiAUsXSyxIiACvinfSnz3Lu4ksvOXqog"
// }
proto.reportStatusDeploy = function (deploymentKey, label, clientUniqueId, others) {
  return this.getPackagesInfo(deploymentKey, label).then(function (packages) {
    var status =  _.get(others, "status");
    if (_.eq(status, "DeploymentSucceeded")) {
      return models.PackagesMetrics.addOneOnInstalledById(packages.id);
    } else if (_.eq(status, "DeploymentFailed")) {
      return models.PackagesMetrics.addOneOnFailedById(packages.id);
    }else {
      return;
    }
  });
};

import * as JSNAMonitorModule from './JSNAMonitor.js';

self.JSNAMonitor = self.JSNAMonitor || {};
JSNAMonitor = JSNAMonitor || {};

/**
 * @constructor
 */
JSNAMonitor.JSNAMonitor = JSNAMonitorModule.JSNAMonitorImpl;

/**
 * @constructor
 */
JSNAMonitor.JSNAMonitor.InfoWidget = JSNAMonitorModule.InfoWidget;

/**
 * @constructor
 */
JSNAMonitor.JSNAMonitor.ProtocolNode = JSNAMonitorModule.ProtocolNode;

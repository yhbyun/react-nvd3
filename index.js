import React from 'react';
import d3 from 'd3';
import nv from 'nvd3';
import {pick, without} from './utils.js'
import assign from 'object-assign';
import MyDebug from 'debug';

let SETTINGS = ['x', 'y', 'width', 'height', 'type', 'dataSource', 'configure'];
let AXIS_NAMES = ['xAxis', 'yAxis','y1Axis', 'y2Axis', 'y3Axis', 'y4Axis', 'x2Axis'];
let SIZE = ['width', 'height'];
let MARGIN = 'margin';

var isArray = Array.isArray;

var log = MyDebug('NV3DChart');

export default class NVD3Chart extends React.Component {
  static propTypes = {
    type: React.PropTypes.string.isRequired,
    configure: React.PropTypes.func,
    onDataSourceResponse: React.PropTypes.func,
    onDataSourceSuccess: React.PropTypes.func,
    onDataSourceError: React.PropTypes.func,
    debug: React.PropTypes.bool
  };

  static defaultProps = {
    debug: false
  }

  state = {
  };

  constructor(props) {
    super(props);
    this.props.debug ? MyDebug.enable('NV3DChart') : MyDebug.disable('NV3DChart');
  }

  componentWillMount() {
    log('componentWillMount()');
  }

  /**
   * Instantiate a new chart setting
   * a callback if exists
   */
  componentDidMount() {
    log('componentDidMount()');

    if (this.isRemoteDataSource(this.props)){
      this.loadDataSource(this.props.dataSource, this.props)
    }

    nv.addGraph(this.renderChart.bind(this), this.props.renderEnd);
  }

  /**
   * Update the chart after state is changed.
   */
  componentDidUpdate() {
    log('componentDidUpdate()');

    this.graphAdded ? 
      this.renderChart():
      nv.addGraph(this.renderChart.bind(this), this.props.renderEnd);
  }

  /**
   * Creates a chart model and render it
   */
  renderChart() {
    log('renderChart()');

    if (!this.data.length) {
      log('no data, so skip renderring chart');
      return;
    }

    // Margins are an special case. It needs to be
    // passed to the margin function.
    this.chart = this.chart || nv.models[this.props.type]();

    this.chart
      .x(this.getValueFunction(this.props.x, 'x'))
      .y(this.getValueFunction(this.props.y, 'y'))
      .margin(this.options(MARGIN, pick).margin || this.propsByPrefix('margin') || {})
      .options(this.options(SETTINGS.concat(AXIS_NAMES, SIZE, MARGIN), without));

    // We need to set the axis options separatly
    this.setAxisOptions(this.chart, this.options(AXIS_NAMES));

    // hook for configuring the chart
    !this.props.configure || this.props.configure(this.chart);

    // Render chart using d3
    d3.select(this.refs.svg)
      .datum(this.data)
      .call(this.chart);

    // Update the chart if the window size change.
    // TODO: review posible leak.
    nv.utils.windowResize(this.chart.update);
    return this.chart;
  }

  /**
   * Configure axis options recursively
   * @param {nvd3 chart} chart  A nvd3 chart instance
   * @param {object} options    A key value object
   */
  setAxisOptions(chart, options) {
    for(let optionName in options){
      let optionValue = options[optionName];
      if(chart) {
        if(typeof optionValue === 'object' && !(optionValue instanceof Array)){
          this.setAxisOptions(chart[optionName], optionValue);
        } else if(typeof chart[optionName] === 'function'){
          chart[optionName](optionValue);
        }
      }
    }
  }

  /**
   * Filter options base on predicates
   * @param {Array} keys          An array of keys to preserve or remove
   * @param {Function} predicate  The function used to filter keys
   */
  options(keys, predicate) {
    if(this.props.chartOptions) console.warn('chartOptions is deprecated use options instead');
    // DEPRECATED: this.props.chartOptions
    let opt = this.props.options || this.props.chartOptions || this.props;
    predicate = predicate || pick;
    return predicate(opt, keys);
  }

  /**
   * Allow to use either a value or a function to
   * @param  {[type]} v        Either a getter or a function name
   * @param  {String} _default A default string used as getter
   * @return {Function}        Returns a function to use as getter
   */
  getValueFunction(v, _default) {
    if(typeof v === 'function') return v;
    return (d) => { return typeof d[v] !== 'undefined' ? d[v] : d[_default]; }
  }

  /**
   * Get properties using a prefix
   * @param  {String} prefix
   * @return {[type]} Return an object with wanted keys
   * DEPRECATED: This was created only for margins and
   * since we changed the api we don't need this anymore.
   */
  propsByPrefix(prefix) {
    console.warn('Set margin with prefixes is deprecated use an object instead');
    prefix = prefix + '-';
    return Object.keys(this.props).reduce((memo, prop) => {
      if (prop.startsWith(prefix)) memo[prop.replace(prefix, '')] = this.props[prop];
      return memo;
    }, {});
  }

  prepareProps(thisProps, state) {
    var props = assign({}, thisProps)

    props.data = this.prepareData(props)
    props.dataSource = this.prepareDataSource(props)

    return props
  }

  /**
   * Returns true if in the current configuration,
   * the datagrid should load its data remotely.
   *
   * @param  {Object}  [props] Optional. If not given, this.props will be used
   * @return {Boolean}
   */
  isRemoteDataSource(props) {
    props = props || this.props;

    return props.dataSource && !isArray(props.dataSource);
  }

  prepareDataSource(props) {
    var dataSource = props.dataSource;

    if (isArray(dataSource)) {
      dataSource = null;
    }

    return dataSource;
  }

  prepareData(props) {

    var data = null;

    if (isArray(props.data)) {
      data = props.data;
    }

    if (isArray(props.dataSource)) {
      data = props.dataSource;
    }

    data = data == null? this.state.defaultData: data;

    if (!isArray(data)) {
      data = [];
    }

    return data;
  }

  /**
   * Loads remote data
   *
   * @param  {String/Function/Promise} [dataSource]
   * @param  {Object} [props]
   */
  loadDataSource(dataSource, props) {
    log('loadDataSource()');

    props = props || this.props;

    if (!arguments.length) {
      dataSource = props.dataSource;
    }

    if (typeof dataSource == 'function') {
      dataSource = dataSource(props);
    }

    if (typeof dataSource == 'string') {
      var fetch = this.props.fetch || global.fetch;

      dataSource = fetch(dataSource);
    }

    if (dataSource && dataSource.then) {

      if (props.onDataSourceResponse){
        dataSource.then(props.onDataSourceResponse, props.onDataSourceResponse);
      } else {

        var errorFn = function(err) {
          if (props.onDataSourceError) {
            props.onDataSourceError(err)
          }
        }.bind(this);

        var noCatchFn = dataSource['catch'] ? null: errorFn;

        dataSource = dataSource
          .then(function (response) {
            return response && typeof response.json == 'function'?
                response.json():
                response;
          })
          .then(function (json) {

            if (props.onDataSourceSuccess) {
              props.onDataSourceSuccess(json);
              return;
            }

            var info;
            if (typeof props.getDataSourceInfo == 'function'){
              info = props.getDataSourceInfo(json);
            }

            var data = info?
                info.data:
                Array.isArray(json)?
                    json:
                    json.data;

            var count = info?
                info.count:
                json.count != null?
                    json.count:
                    null;

            var newState = {
              defaultData: data
            };

            if (count != null) {
              newState.defaultDataSourceCount = count;
            }

            log('recv data and setState')
            this.setState(newState);
          }.bind(this), noCatchFn);

        if (dataSource['catch']) {
          dataSource['catch'](errorFn);
        }
      }

      if (props.onDataSourceLoaded) {
        dataSource.then(props.onDataSourceLoaded);
      }
    }

    return dataSource;
  }

  /**
   * Render function
   * svg element needs to have height and width.
   */
  render() {
    log('render()');

    var props = this.prepareProps(this.props, this.state);

    this.data = props.data;
    this.dataSource = props.dataSource;
    this.graphAdded = this.graphAdded || false;

    return (
      <div ref="root" className="nv-chart">
        <svg ref="svg" {...pick(this.props, SIZE)}></svg>
      </div>
    );
  }
}

// Babel 6 issue: http://stackoverflow.com/questions/33505992/babel-6-changes-how-it-exports-default
module.exports = NVD3Chart;

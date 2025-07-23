const ReactDOM = require('react-dom');
if (!ReactDOM.render) {
  ReactDOM.render = () => null;
}
if (!ReactDOM.unmountComponentAtNode) {
  ReactDOM.unmountComponentAtNode = () => null;
}

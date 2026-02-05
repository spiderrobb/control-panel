const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const extensionConfig = {
  target: 'node',
  mode: 'none',
  entry: './extension.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.js']
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader'
        }
      }
    ]
  },
  devtool: process.env.NODE_ENV === 'production' ? false : 'nosources-source-map',
  performance: {
    hints: false
  }
};

const webviewConfig = {
  target: ['web', 'es2020'],
  mode: 'none',
  entry: './webview-ui/index.jsx',
  output: {
    path: path.resolve(__dirname, 'dist/webview'),
    filename: 'webview.js'
  },
  resolve: {
    extensions: ['.js', '.jsx', '.mdx']
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react']
          }
        }
      },
      {
        test: /\.mdx$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-react']
            }
          },
          {
            loader: '@mdx-js/loader'
          }
        ]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './webview-ui/index.html',
      filename: 'webview.html'
    })
  ],
  devtool: process.env.NODE_ENV === 'production' ? false : 'nosources-source-map',
  performance: {
    hints: false
  }
};

module.exports = [extensionConfig, webviewConfig];

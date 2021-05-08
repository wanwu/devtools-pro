const path = require('path');
const webpack = require('webpack');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const SanLoaderPlugin = require('san-loader/lib/plugin');
const TerserPlugin = require('terser-webpack-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const MiniCssExportPlugin = require('mini-css-extract-plugin');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');

const cssNanoOptions = {
    assetNameRegExp: /\.css$/g,
    cssProcessorOptions: {
        mergeLonghand: false,
        cssDeclarationSorter: false,
        normalizeUrl: false,
        discardUnused: false,
        // 避免 cssnano 重新计算 z-index
        zindex: false,
        reduceIdents: false,
        safe: true,
        // cssnano 集成了autoprefixer的功能
        // 会使用到autoprefixer进行无关前缀的清理
        // 关闭autoprefixer功能
        // 使用postcss的autoprefixer功能
        autoprefixer: false,
        discardComments: {
            removeAll: true
        }
    },
    canPrint: true
};

const resolve = p => path.resolve(__dirname, './src', p);

const pkg = require('./package.json');
const isProduction = process.env.NODE_ENV === 'production';
const plugins = [
    new SanLoaderPlugin(),
    new webpack.BannerPlugin({
        banner: `${pkg.name} v${pkg.verion}\nby ${pkg.author}\nCreated at ${dateFormat(
            new Date(),
            'yyyy-MM-dd hh:mm:ss'
        )}`
    }),
    new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
        'process.env.DEBUG': JSON.stringify(process.env.DEBUG)
    }),
    new HtmlWebpackPlugin({
        filename: 'home.html',
        chunks: ['home'],
        alwaysWriteToDisk: true,
        template: './pages/home.html'
    }),
    new HtmlWebpackPlugin({
        filename: 'demo.html',
        chunks: ['launcher'],
        template: './pages/demo.html'
    }),
    new NodePolyfillPlugin({
        excludeAliases: ['console']
    })
];
if (isProduction) {
    plugins.push(new MiniCssExportPlugin(), new CleanWebpackPlugin());
}
module.exports = {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? false : 'eval-cheap-source-map',
    output: {
        filename: '[name].js',
        libraryTarget: 'umd',
        libraryExport: 'default',
        umdNamedDefine: true,
        path: path.resolve('./dist/')
    },
    devServer: {
        contentBase: './dist',
        hot: true
    },
    resolve: {
        alias: {
            '@': resolve('/'),
            '@lib': resolve('lib'),
            '@components': resolve('components')
        }
    },
    optimization: isProduction
        ? {
              minimize: true,
              splitChunks: {
                  cacheGroups: {
                      santd: {
                          test(module, chunks) {
                              const test = /[\\/]node_modules[\\/]santd/;
                              if (module.nameForCondition && test.test(module.nameForCondition())) {
                                  return module.type === 'javascript/auto';
                              }
                              for (const chunk of module.chunksIterable) {
                                  if (chunk.name && test.test(chunk.name)) {
                                      return module.type === 'javascript/auto';
                                  }
                              }
                              return false;
                          },
                          name: 'santd',
                          chunks(chunk) {
                              // exclude index chunk, 这个 chunk 用于外部直接使用 frontend
                              return chunk.name !== 'index';
                          }
                      }
                  }
              },
              minimizer: [new TerserPlugin(), new OptimizeCSSAssetsPlugin(cssNanoOptions)]
          }
        : undefined,
    entry: {
        launcher: './src/launcher.js',
        home: './src/home.js'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader'
                }
            },
            {
                oneOf: [
                    {
                        test: /\.svg$/,
                        use: [
                            {
                                loader: 'url-loader',
                                options: {
                                    limit: 8192
                                }
                            }
                        ]
                    },
                    {
                        test: /\.(eot|woff|woff2|ttf|svg)$/,
                        loader: 'file-loader',
                        options: {
                            limit: 6000,
                            name: 'icons/[name]-[hash:8].[ext]'
                        }
                    },
                    {
                        test: /\.less$/,
                        use: [
                            isProduction ? MiniCssExportPlugin.loader : 'style-loader',
                            'css-loader',
                            {
                                loader: 'postcss-loader'
                            },
                            {
                                loader: 'less-loader',
                                options: {
                                    lessOptions: {
                                        // strictMath: true,
                                        javascriptEnabled: true
                                    }
                                }
                            }
                        ]
                    },
                    {
                        test: /\.css$/,
                        use: [
                            isProduction ? MiniCssExportPlugin.loader : 'style-loader',
                            'css-loader',
                            {
                                loader: 'postcss-loader'
                            }
                        ]
                    }
                ]
            },
            {
                test: /\.san$/,
                use: 'san-loader'
            },
            {
                test: /\.html$/,
                use: [
                    {
                        loader: 'html-loader',
                        options: {
                            esModule: false,
                            minimize: false,
                            sources: {
                                list: [
                                    {
                                        tag: 'img',
                                        attribute: 'src',
                                        type: 'src'
                                    },
                                    {
                                        tag: 'san-avatar',
                                        attribute: 'src',
                                        type: 'src'
                                    }
                                ]
                            }
                        }
                    }
                ]
            }
        ]
    },
    plugins
};

function dateFormat(d, pattern = 'yyyy-MM-dd') {
    if (!d) {
        d = new Date();
    }
    let y = d.getFullYear().toString();
    let o = {
        M: d.getMonth() + 1, // month
        d: d.getDate(), // day
        h: d.getHours(), // hour
        m: d.getMinutes(), // minute
        s: d.getSeconds() // second
    };
    pattern = pattern.replace(/(y+)/gi, (a, b) => y.substr(4 - Math.min(4, b.length)));
    Object.keys(o).forEach(i => {
        pattern = pattern.replace(new RegExp('(' + i + '+)', 'g'), (a, b) =>
            o[i] < 10 && b.length > 1 ? '0' + o[i] : o[i]
        );
    });
    return pattern;
}

/*
 Copyright 2022 Esri

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

import AppBase from "./support/AppBase.js";
import AppLoader from "./loaders/AppLoader.js";
import SignIn from './apl/SignIn.js';
import FeaturesList from './apl/FeaturesList.js';
import SynchronizedViews from './support/SynchronizedViews.js';

class Application extends AppBase {

  // PORTAL //
  portal;

  constructor() {
    super();

    // LOAD APPLICATION BASE //
    super.load().then(() => {

      // APPLICATION LOADER //
      const applicationLoader = new AppLoader({app: this});
      applicationLoader.load().then(({portal, group, map, view}) => {
        //console.info(portal, group, map, view);

        // PORTAL //
        this.portal = portal;

        // USER SIGN-IN //
        this.configUserSignIn();

        // SET APPLICATION DETAILS //
        this.setApplicationDetails({map, group});

        // APPLICATION //
        this.applicationReady({portal, group, map, view}).catch(this.displayError).then(() => {
          // HIDE APP LOADER //
          document.getElementById('app-loader').removeAttribute('active');
        });

      }).catch(this.displayError);
    }).catch(this.displayError);

  }

  /**
   *
   */
  configUserSignIn() {

    const signInContainer = document.getElementById('sign-in-container');
    if (signInContainer) {
      const signIn = new SignIn({container: signInContainer, portal: this.portal});
    }

  }

  /**
   *
   * @param view
   */
  configView(view) {
    return new Promise((resolve, reject) => {
      if (view) {
        require([
          'esri/core/reactiveUtils',
          'esri/widgets/Home',
          'esri/widgets/Search',
          'esri/widgets/LayerList',
          'esri/widgets/Legend'
        ], (reactiveUtils, Home, Search, LayerList, Legend) => {

          //
          // CONFIGURE VIEW SPECIFIC STUFF HERE //
          //
          view.set({
            environment: {atmosphereEnabled: false},
            constraints: {snapToZoom: false},
            popup: {
              dockEnabled: true,
              dockOptions: {
                buttonEnabled: false,
                breakpoint: false,
                position: "top-right"
              }
            }
          });

          // HOME //
          const home = new Home({view});
          view.ui.add(home, {position: 'top-left', index: 0});

          // LEGEND //
          /*
           const legend = new Legend({ view: view });
           view.ui.add(legend, {position: 'bottom-left', index: 0});
           */

          // SEARCH /
          /*
           const search = new Search({ view: view});
           view.ui.add(legend, {position: 'top-right', index: 0});
           */

          // LAYER LIST //
          /*const layerList = new LayerList({
           container: 'layer-list-container',
           view: view,
           listItemCreatedFunction: (event) => {
           event.item.open = (event.item.layer.type === 'group');
           },
           visibleElements: {statusIndicators: true}
           });*/

          // VIEW UPDATING //
          this.disableViewUpdatingIndicator = false;
          const viewUpdating = document.getElementById('view-updating');
          view.ui.add(viewUpdating, 'bottom-right');
          reactiveUtils.watch(() => view.updating, (updating) => {
            (!this.disableViewUpdatingIndicator) && viewUpdating.toggleAttribute('active', updating);
          });

          resolve();
        });
      } else { resolve(); }
    });
  }

  /**
   *
   * @param portal
   * @param group
   * @param map
   * @param view
   * @returns {Promise}
   */
  applicationReady({portal, group, map, view}) {
    return new Promise(async (resolve, reject) => {
      // VIEW READY //
      this.configView(view).then(() => {

        this.initializeOverview({view}).then(({mapView}) => {
          this.initializeCommuteLocationsLayer({view, mapView});
          this.initializeOSMShops({view});
          //const syncViews = new SynchronizedViews({views: [view, mapView]});
        });

        resolve();
      }).catch(reject);
    });
  }

  /**
   *
   * @param view
   * @param mapView
   */
  initializeCommuteLocationsLayer({view, mapView}) {
    require([
      'esri/core/reactiveUtils',
      'esri/TimeExtent',
      'esri/widgets/TimeSlider'
    ], (reactiveUtils, TimeExtent, TimeSlider) => {

      const locations2DLayer = view.map.layers.find(l => l.title === 'Commute locations 2D');
      const locationsLayer = view.map.layers.find(l => l.title === 'Commute locations');

      Promise.all([
        locations2DLayer.load(),
        locationsLayer.load()
      ]).then(async () => {

        locations2DLayer.renderer.symbol = {
          type: 'simple-marker',
          size: 9,
          color: '#43abeb',
          outline: {
            width: 1.0,
            color: '#ffffff'
          }
        };

        /**
         *
         * https://developers.arcgis.com/javascript/latest/api-reference/esri-layers-FeatureLayer.html#featureReduction
         *  - By default this property is null, which indicates the layer view should draw every feature.
         *
         */
        locationsLayer.featureReduction = null;
        locationsLayer.screenSizePerspectiveEnabled = false;

        view.whenLayerView(locations2DLayer).then(locations2DLayerView => {
          locations2DLayerView.visible = false;
        });
        mapView.whenLayerView(locationsLayer).then(locationsLayerView => {
          locationsLayerView.visible = false;
        });

        const timeStats = await locationsLayer.queryFeatures({
          outStatistics: [
            {statisticType: "min", onStatisticField: locationsLayer.timeInfo.startField, outStatisticFieldName: 'start'},
            {statisticType: "max", onStatisticField: locationsLayer.timeInfo.endField, outStatisticFieldName: 'end'}
          ]
        });
        const {start, end} = timeStats.features[0].attributes;
        const statsExtent = new TimeExtent({start: new Date(start), end: new Date(end)});
        const displayExtent = statsExtent.expandTo('minutes');
        const initialExtent = new TimeExtent({start: displayExtent.start, end: displayExtent.start});

        const timeSlider = new TimeSlider({
          container: 'time-slider-container',
          mode: 'time-window',  // time-window | instant
          playRate: 100,
          loop: true,
          timeVisible: true,
          stops: {interval: {value: 30, unit: "seconds"}},
          fullTimeExtent: displayExtent,
          timeExtent: initialExtent
        });

        timeSlider.when(() => {
          locations2DLayer.visible = true;
          locationsLayer.visible = true;

          reactiveUtils.watch(() => timeSlider.timeExtent, () => {
            view.timeExtent = mapView.timeExtent = timeSlider.timeExtent;
            /*{
             start: timeSlider.timeExtent.start,
             end: new Date(timeSlider.timeExtent.end.valueOf() + 10)
             };*/
          }, {initial: true});

          reactiveUtils.watch(() => timeSlider.viewModel.state, (state) => {
            this.disableViewUpdatingIndicator = (state === 'playing');
          }, {initial: true});

        });

      });
    });
  }

  /**
   *
   * @param view
   */
  initializeOverview({view}) {
    return new Promise((resolve, reject) => {
      require([
        'esri/core/reactiveUtils',
        'esri/views/MapView'
      ], (reactiveUtils, MapView) => {

        const mapViewContainer = document.createElement('div');
        mapViewContainer.classList.add('map-overview', 'esri-widget');
        view.ui.add(mapViewContainer, 'bottom-left');

        const mapView = new MapView({
          container: mapViewContainer,
          ui: {components: []},
          map: view.map,
          extent: view.extent
        });
        mapView.when(() => {
          resolve({mapView});
        });

      });
    });
  }

  /**
   *
   * @param view
   */
  initializeOSMShops({view}) {

    const shopsLayer = view.map.layers.find(layer => layer.title === "OSM Shops");
    shopsLayer.load().then(() => {
      shopsLayer.set({
        outFields: ["*"]
      });

      const renderer = shopsLayer.renderer.clone();
      renderer.uniqueValueInfos = shopsLayer.renderer.uniqueValueInfos.map(uvInfo => {

        const symbolLayer = uvInfo.symbol.symbolLayers.getItemAt(0);
        symbolLayer.set({height: 1000, width: 100});
        uvInfo.symbol.symbolLayers = [symbolLayer];

        return uvInfo;
      });
      shopsLayer.renderer = renderer;

    });

  }

}

export default new Application();

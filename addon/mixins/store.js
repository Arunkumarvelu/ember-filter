import Ember from 'ember';
import Configuration from './../configuration';
import DS from 'ember-data';
const { PromiseArray } = DS;
const { Promise } = Ember.RSVP;

export default Ember.Mixin.create({


  /**
    The filter store.
    @property filterStore
    @type BaseStore
    @readOnly
    @default null
    @public
  */
  filterStore: null,

  /**
    `findAll` ask the adapter's `findAll` method to find the records
    for the given type, and return a promise that will be resolved
    once the server returns the values. The promise will resolve into
    all records of this type present in the store, even if the server
    only returns a subset of them.
    ```app/routes/authors.js
    import Ember from 'ember';
    export default Ember.Route.extend({
      model: function(params) {
        return this.store.findAll('author');
      }
    });
    ```
    @method filter
    @param {String} modelName
    @param {Object} options
    @return {DS.AdapterPopulatedRecordArray}
  */
  filter(modelName, filterId, options) {
    Ember.assert('Passing classes to store methods has been removed. Please pass a dasherized string instead of '+ Ember.inspect(modelName), typeof modelName === 'string');
    var typeClass = this.modelFor(modelName);

    return this._filter(typeClass, filterId, options);
  },

  /**
    Returns a filter model class for a particular key. Used by
    methods that take a type key (like `filter`,
    etc.)
    @method filterFor
    @param {String} modelName
    @return {DS.Model}
  */
  filterFor(modelName){
    var filter = Configuration.filterModelEndsWith;
    Ember.assert('Passing classes to store methods has been removed. Please pass a dasherized string instead of '+ Ember.inspect(modelName), typeof modelName === 'string');
    var factory = this.modelFactoryFor(modelName+filter);
    if (!factory) {
      throw new Ember.Error("No filter was found for '" + modelName + "'");
    }

    factory.modelName = factory.modelName || DS.normalizeModelName(modelName+filter);

    return factory;
  },

  /**
    @method restoreFilter
    @param {String} modelName
    @return {Object}
  */

  restoreFilter(modelName){
    var filterClass = this.filterFor(modelName);
    return this.filterStore.restoreFor(filterClass.modelName);
  },

  /**
    @method _filter
    @private
    @param {DS.Model} typeClass
    @param {Object} options
    @return {Promise} promise
  */
  _filter(typeClass, filterId, options){
    options = options || {};
    var adapter = this.adapterFor(typeClass.modelName);
    var filterClass = this.filterFor(typeClass.modelName);
    var queryHash = null;
    Ember.assert("You tried to filter all records but you have no adapter (for " + typeClass + ")", adapter);
    Ember.assert("You tried to filter all records but your adapter does not implement `filter`", typeof adapter.filter === 'function');
    Ember.assert("You tried to filter all records but you have no filter (for " + typeClass + ")", filterClass);
    var filter = this.peekRecord(filterClass.modelName, filterId);
    var filterContent = this.restoreFilter(typeClass.modelName);
    if(filterContent && !!filterContent['query_hash']){
      queryHash = filterContent['query_hash'];
      filter.set('modifiedQuery', queryHash);
      filter.set('queryModified', true);
    }
    if(filter && filter.get('queryModified')){
      queryHash = filter.serializedQuery();
    }
    return PromiseArray.create({
      promise: Promise.resolve(this._filterAll(adapter, filterId, typeClass, queryHash, options))
    });
  },

  /**
    @method _filterAll
    @private
    @param {DS.Adapter} adapter
    @param {DS.Model} filter
    @param {DS.Model} typeClass
    @param {Object} options
    @return {Promise} promise
  */
  _filterAll(adapter, filterId, typeClass, query_hash, options){
    var $this = this;
    var modelName = typeClass.modelName;
    var promise = adapter.filter(this, typeClass, filterId, query_hash, options);
    var serializer = this.serializerFor(modelName);
    var label = "DS: Handle Adapter#filter of " + typeClass;
    var filterModelName = this.filterFor(modelName).modelName;

    promise = Promise.resolve(promise, label);

    this.updateStore(filterId, filterModelName, query_hash);

    return promise.then(function(adapterPayload) {
      return $this._adapterRun(function() {
        let payload = adapter.handleFilterResponse(modelName, adapterPayload),
          data = serializer._normalizeArray($this, modelName, payload);
        //TODO Optimize
        return $this.push(data);
      });
    }, null, "DS: Extract payload of filter " + typeClass);
  },

  /**
    @method updateStore
    @private
    @param {Number} filterId
    @param {String} modelName
    @param {Object} query_hash
  */
  updateStore(filterId, filterModelName, query_hash){
    this.filterStore.persist(filterModelName, {id: filterId, query_hash: query_hash});
  }
});

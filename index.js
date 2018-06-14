const fs = require ('fs');
const rp = require ('request-promise');
const download = require ('image-downloader');
const md5 = require ('md5');
const {API_KEY, USERNAME, PASSWORD} = process.env;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const params = {
    args: {},
    args_parameters: {
      LIST_PATH_NAME: '-i',
      IMAGE_PATH_NAME: '-o'
    },
    list: '',
    delimiter_list: '/',
    charset_list: 'UTF-8',
    data_list: [],
    api_methods: {
      LOGIN: 'LOGIN',
      ASSET_TO_MEDIA: 'ASSET_TO_MEDIA'
    },
    api: {
        url: 'https://api.gettyimages.com/mms',
        v: 'v1',
        port: 80,
        headers: {
          'Api-Key': API_KEY
        },
        qs: {},
        methods: {
            LOGIN: {
                method: 'POST',
                path: '/account/login',
                headers: {
                    'Content-Type': 'application/json'
                }
            },
            ASSET_TO_MEDIA: {
                method: 'GET',
                headers: {
                    'x-user-mode': 'owner_administrator'
                }
            }
        }
    },
    image_path_name: 'images',
    image_type: 'jpg',
    temporary_payload: '',
    images_links: [],
    download_processing: [],
    image_download_processing: []
};
params.errors = {
    UNKNOW_LIST_PATH_NAME: `please, fill "${params.args_parameters.LIST_PATH_NAME}" parameters to path with list of ids`,
    EMPTY_LIST_FILE: `empty file by path `,
    INVALID_ROW: `row is invalid `
};
params.success = {
    LINKS_WAS_DOWNLOADED: `links was successfully downloaded`,
    ASSETS_WAS_DONWLOADED: `assets was successfully downloaded`,
    ASSET_WAS_DONWLOAD: `asset was successfully downloaded`,
    SUCCESSFULLY: 'Successfully finished'
};

const isNumeric = n => !isNaN(parseFloat(n)) && isFinite(n);
const getRequestOptions = (request_name, form_data = {}, qs = {}, headers = {}, json = false, custom = {}) => {
    const method = params.api.methods[request_name];
    return {
        body: form_data,
        uri: `${params.api.url}/${params.api.v}${custom.path ? custom.path : method.path}`,
        method: method.method,
        headers: Object.assign(params.api.headers, method.headers, headers),
        qs: Object.assign(params.api.qs, qs),
        json: json
    }
};
const downloadImage = uri => {
    const time = new Date().getTime(),
        image_name = `${params.image_path_name}/${md5(`${uri}${time}`)}.${params.image_type}`,
        downloadOptions = { url: uri, dest: image_name };
    return download.image (downloadOptions).then(() => console.log(`${params.success.ASSET_WAS_DONWLOAD} to ${downloadOptions.dest}`))
};
const linksWasGet = body => {
    if (!isSuccessRequest(body) || body.split) return ;
    const link = body.data || body;
    if (Array.isArray(link)) link.map(linksWasGet);
    return downloadImage(link);
};
const isSuccessRequest = json => json.info.success;
const processing = async () => {

    process.argv.reduce((prev, current) => prev.split ? params.args[prev] = current.trim() : current);
    if (!params.args[params.args_parameters.LIST_PATH_NAME]) throw { reason: params.errors.UNKNOW_LIST_PATH_NAME };
    params.list = await fs.readFileSync(params.args[params.args_parameters.LIST_PATH_NAME], params.charset_list);
    if (!params.list) throw { reason: `${params.errors.EMPTY_LIST_FILE} ${params.args[params.args_parameters.LIST_PATH_NAME]}` };
    params.list.split('\n').map(item => {
        if (!item) return ;
        const [asset_id, media_id] = item.split(params.delimiter_list);
        if (!isNumeric(asset_id) || !isNumeric(media_id)) throw { reason: `${params.errors.INVALID_ROW} ${item}` };
        params.data_list.push({asset_id, media_id});
    });
    params.image_path_name = params.args[params.args_parameters.IMAGE_PATH_NAME] || params.image_path_name;
    if (!fs.existsSync(params.image_path_name)) fs.mkdirSync(params.image_path_name);
    params.temporary_payload = await rp (getRequestOptions (params.api_methods.LOGIN, {username: USERNAME, password: PASSWORD}, {}, {}, true));
    if (!isSuccessRequest(params.temporary_payload)) throw { reason: JSON.stringify(params.temporary_payload) };
    params.api.qs.access_token = params.temporary_payload.data.token;

    params.data_list.map(item => params.download_processing.push(
        rp (getRequestOptions (params.api_methods.ASSET_TO_MEDIA, {}, {}, {}, true, { path: `/assets/${item.asset_id}/media/files/${item.media_id}`}))
            .then(items => params.image_download_processing.push(linksWasGet(items)))
    ));

    return Promise
        .all(params.download_processing)
        .then(() => console.log(params.success.LINKS_WAS_DOWNLOADED))
        .then(() => Promise.all(params.image_download_processing))
        .then(() => params.success.SUCCESSFULLY);

};

processing().then(console.log).catch(console.error);

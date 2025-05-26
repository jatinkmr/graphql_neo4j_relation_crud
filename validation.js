const Joi = require('joi');

exports.createUserValidation = data => {
    const schema = Joi.object().keys({
        username: Joi.string().required(),
        email: Joi.string().email().required(),
        fullName: Joi.string().required()
    })

    return schema.validate(data)
}

exports.fetchUserList = data => {
    const schema = Joi.object().keys({
        pageNumber: Joi.number().integer().min(1).required(),
        pageSize: Joi.number().integer().min(1).max(100).required()
    });

    return schema.validate(data);
}
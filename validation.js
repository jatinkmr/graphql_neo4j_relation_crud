const Joi = require('joi');

exports.createUserValidation = data => {
    const schema = Joi.object().keys({
        username: Joi.string().required(),
        email: Joi.string().email().required(),
        fullName: Joi.string().required()
    })

    return schema.validate(data)
}

exports.fetchList = data => {
    const schema = Joi.object().keys({
        pageNumber: Joi.number().integer().min(1).required(),
        pageSize: Joi.number().integer().min(1).max(100).required()
    });

    return schema.validate(data);
}

exports.updateUserValidation = data => {
    const schema = Joi.object().keys({
        username: Joi.string().optional(),
        fullName: Joi.string().optional()
    })

    return schema.validate(data);
}

exports.postCreationValidation = data => {
    const schema = Joi.object().keys({
        authorId: Joi.string().required(),
        title: Joi.string().required(),
        content: Joi.string().required()
    });

    return schema.validate(data);
}

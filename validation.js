const Joi = require('joi');

exports.createUserValidation = data => {
    const schema = Joi.object().keys({
        username: Joi.string().required(),
        email: Joi.string().email().required(),
        fullName: Joi.string().required()
    })

    return schema.validate(data)
}

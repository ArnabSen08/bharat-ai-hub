const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Comprehensive Security Middleware for Bharat AI Hub
 * Implements authentication, authorization, rate limiting, and security headers
 */

class SecurityMiddleware {
    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || this.generateSecureSecret();
        this.refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET || this.generateSecureSecret();
        this.encryptionKey = process.env.ENCRYPTION_KEY || this.generateEncryptionKey();
        
        // Rate limiting configurations
        this.rateLimiters = this.setupRateLimiters();
        
        // Security headers
        this.helmetConfig = this.setupHelmet();
    }

    generateSecureSecret() {
        return crypto.randomBytes(64).toString('hex');
    }

    generateEncryptionKey() {
        return crypto.randomBytes(32);
    }

    setupRateLimiters() {
        return {
            // General API rate limiting
            general: rateLimit({
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 100, // limit each IP to 100 requests per windowMs
                message: {
                    error: 'Too many requests from this IP, please try again later.',
                    retryAfter: '15 minutes'
                },
                standardHeaders: true,
                legacyHeaders: false,
                handler: (req, res) => {
                    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
                    res.status(429).json({
                        error: 'Too many requests',
                        retryAfter: '15 minutes'
                    });
                }
            }),

            // Strict rate limiting for authentication endpoints
            auth: rateLimit({
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 5, // limit each IP to 5 login attempts per windowMs
                message: {
                    error: 'Too many authentication attempts, please try again later.',
                    retryAfter: '15 minutes'
                },
                skipSuccessfulRequests: true,
                handler: (req, res) => {
                    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
                    res.status(429).json({
                        error: 'Too many authentication attempts',
                        retryAfter: '15 minutes'
                    });
                }
            }),

            // ML inference rate limiting
            ml: rateLimit({
                windowMs: 60 * 1000, // 1 minute
                max: 10, // limit each IP to 10 ML requests per minute
                message: {
                    error: 'ML inference rate limit exceeded, please try again later.',
                    retryAfter: '1 minute'
                }
            })
        };
    }

    setupHelmet() {
        return helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
                    fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
                    scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "https://api.bharataihub.com"],
                    frameSrc: ["'none'"],
                    objectSrc: ["'none'"],
                    upgradeInsecureRequests: [],
                },
            },
            crossOriginEmbedderPolicy: false,
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        });
    }

    // Encrypt sensitive data
    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    // Decrypt sensitive data
    decrypt(encryptedText) {
        const textParts = encryptedText.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encrypted = textParts.join(':');
        const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    // Hash passwords
    async hashPassword(password) {
        const saltRounds = 12;
        return await bcrypt.hash(password, saltRounds);
    }

    // Verify passwords
    async verifyPassword(password, hashedPassword) {
        return await bcrypt.compare(password, hashedPassword);
    }

    // Generate JWT tokens
    generateTokens(payload) {
        const accessToken = jwt.sign(payload, this.jwtSecret, {
            expiresIn: '15m',
            issuer: 'bharat-ai-hub',
            audience: 'bharat-ai-hub-users'
        });

        const refreshToken = jwt.sign(payload, this.refreshTokenSecret, {
            expiresIn: '7d',
            issuer: 'bharat-ai-hub',
            audience: 'bharat-ai-hub-users'
        });

        return { accessToken, refreshToken };
    }

    // Verify JWT tokens
    verifyToken(token, isRefreshToken = false) {
        try {
            const secret = isRefreshToken ? this.refreshTokenSecret : this.jwtSecret;
            return jwt.verify(token, secret, {
                issuer: 'bharat-ai-hub',
                audience: 'bharat-ai-hub-users'
            });
        } catch (error) {
            throw new Error('Invalid token');
        }
    }

    // Authentication middleware
    authenticate() {
        return async (req, res, next) => {
            try {
                const authHeader = req.headers.authorization;
                
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({
                        error: 'Access token required',
                        code: 'MISSING_TOKEN'
                    });
                }

                const token = authHeader.substring(7);
                const decoded = this.verifyToken(token);
                
                req.user = decoded;
                req.userId = decoded.userId;
                req.userRole = decoded.role;

                logger.info(`Authenticated user: ${decoded.userId}`);
                next();
            } catch (error) {
                logger.warn(`Authentication failed: ${error.message}`);
                return res.status(401).json({
                    error: 'Invalid or expired token',
                    code: 'INVALID_TOKEN'
                });
            }
        };
    }

    // Authorization middleware
    authorize(roles = []) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({
                    error: 'Authentication required',
                    code: 'NOT_AUTHENTICATED'
                });
            }

            if (roles.length > 0 && !roles.includes(req.userRole)) {
                logger.warn(`Authorization failed for user ${req.userId}: required roles ${roles}, user role: ${req.userRole}`);
                return res.status(403).json({
                    error: 'Insufficient permissions',
                    code: 'INSUFFICIENT_PERMISSIONS',
                    requiredRoles: roles
                });
            }

            next();
        };
    }

    // Input validation and sanitization
    validateInput() {
        return (req, res, next) => {
            // Remove potentially dangerous characters
            const sanitize = (obj) => {
                if (typeof obj === 'string') {
                    return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                             .replace(/javascript:/gi, '')
                             .replace(/on\w+\s*=/gi, '');
                }
                if (typeof obj === 'object' && obj !== null) {
                    for (let key in obj) {
                        obj[key] = sanitize(obj[key]);
                    }
                }
                return obj;
            };

            req.body = sanitize(req.body);
            req.query = sanitize(req.query);
            req.params = sanitize(req.params);

            next();
        };
    }

    // CORS configuration
    corsConfig() {
        return (req, res, next) => {
            const allowedOrigins = [
                'https://bharataihub.com',
                'https://www.bharataihub.com',
                'https://arnabsen08.github.io',
                'http://localhost:3000',
                'http://localhost:3001'
            ];

            const origin = req.headers.origin;
            if (allowedOrigins.includes(origin)) {
                res.setHeader('Access-Control-Allow-Origin', origin);
            }

            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

            if (req.method === 'OPTIONS') {
                res.status(200).end();
                return;
            }

            next();
        };
    }

    // Request logging and monitoring
    requestLogger() {
        return (req, res, next) => {
            const startTime = Date.now();
            const requestId = crypto.randomUUID();
            
            req.requestId = requestId;
            
            // Log request
            logger.info(`[${requestId}] ${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                userId: req.userId || 'anonymous'
            });

            // Log response
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                logger.info(`[${requestId}] Response: ${res.statusCode} (${duration}ms)`);
                
                // Alert on suspicious activity
                if (res.statusCode >= 400) {
                    logger.warn(`[${requestId}] Error response: ${res.statusCode}`, {
                        path: req.path,
                        method: req.method,
                        ip: req.ip
                    });
                }
            });

            next();
        };
    }

    // Security headers middleware
    securityHeaders() {
        return this.helmetConfig;
    }

    // API key validation for external integrations
    validateApiKey() {
        return (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            
            if (!apiKey) {
                return res.status(401).json({
                    error: 'API key required',
                    code: 'MISSING_API_KEY'
                });
            }

            // In production, validate against database
            const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
            
            if (!validApiKeys.includes(apiKey)) {
                logger.warn(`Invalid API key attempt: ${apiKey.substring(0, 8)}...`);
                return res.status(401).json({
                    error: 'Invalid API key',
                    code: 'INVALID_API_KEY'
                });
            }

            next();
        };
    }

    // Detect and prevent common attacks
    attackPrevention() {
        return (req, res, next) => {
            const suspiciousPatterns = [
                /(\<|\%3C)script(.|\n)*?(\>|\%3E)/i,
                /(\<|\%3C)iframe(.|\n)*?(\>|\%3E)/i,
                /(union|select|insert|delete|update|drop|create|alter|exec|execute)/i,
                /(\.\./|\.\.\\|\.\.%2f|\.\.%5c)/i
            ];

            const checkForAttacks = (value) => {
                if (typeof value === 'string') {
                    return suspiciousPatterns.some(pattern => pattern.test(value));
                }
                if (typeof value === 'object' && value !== null) {
                    return Object.values(value).some(checkForAttacks);
                }
                return false;
            };

            if (checkForAttacks(req.body) || checkForAttacks(req.query) || checkForAttacks(req.params)) {
                logger.error(`Attack attempt detected from IP: ${req.ip}`, {
                    path: req.path,
                    method: req.method,
                    body: req.body,
                    query: req.query
                });

                return res.status(400).json({
                    error: 'Malicious request detected',
                    code: 'ATTACK_DETECTED'
                });
            }

            next();
        };
    }

    // Get all middleware in correct order
    getAllMiddleware() {
        return [
            this.securityHeaders(),
            this.corsConfig(),
            this.requestLogger(),
            this.validateInput(),
            this.attackPrevention()
        ];
    }

    // Get rate limiters
    getRateLimiters() {
        return this.rateLimiters;
    }
}

module.exports = new SecurityMiddleware();
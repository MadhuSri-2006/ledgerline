// Admin User Management Controller
// Restricted exclusively to users with Role.ADMIN

const bcrypt = require('bcryptjs');
const prisma = require('../config/db');

async function listUsers(req, res) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
        accounts: {
          select: {
            id: true,
            accountNumber: true,
            type: true,
            balance: true,
            currency: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ users });
  } catch (err) {
    console.error('ListUsers Error:', err);
    return res.status(500).json({ error: 'Internal server error listing users.' });
  }
}

async function createUser(req, res) {
  try {
    const { email, password, fullName, role } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Validation failed: Email, password, and fullName are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } });

    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists.' });
    }

    const validRoles = ['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR'];
    const assignedRole = role && validRoles.includes(role) ? role : 'ACCOUNT_HOLDER';

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = await prisma.user.create({
      data: {
        email: trimmedEmail,
        passwordHash,
        fullName,
        role: assignedRole,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'ADMIN_USER_CREATED',
        status: 'SUCCESS',
        reason: `Admin created new user ${user.email} with role ${user.role}`,
      },
    });

    return res.status(201).json({
      message: 'User created successfully.',
      user,
    });
  } catch (err) {
    console.error('CreateUser Error:', err);
    return res.status(500).json({ error: 'Internal server error creating user.' });
  }
}

module.exports = {
  listUsers,
  createUser,
};

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Header Component
const Header = ({ currentPage, setCurrentPage }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="bg-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-4">
            <div className="flex-shrink-0">
              <h1 className="text-2xl font-bold text-blue-900">AKAZ SPORTS HUB</h1>
              <p className="text-sm text-gray-600">Premium Sports Equipment Distributor</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-8">
            <button 
              onClick={() => setCurrentPage('home')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                currentPage === 'home' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
              }`}
            >
              Home
            </button>
            <button 
              onClick={() => setCurrentPage('products')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                currentPage === 'products' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
              }`}
            >
              Products
            </button>
            <button 
              onClick={() => setCurrentPage('brands')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                currentPage === 'brands' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
              }`}
            >
              Brands
            </button>
            <button 
              onClick={() => setCurrentPage('inquiry')}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              B2B Inquiry
            </button>
          </nav>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-400 hover:text-gray-500 focus:outline-none focus:text-gray-500 transition duration-150 ease-in-out"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-gray-200">
            <nav className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              <button 
                onClick={() => { setCurrentPage('home'); setIsMenuOpen(false); }}
                className={`block px-3 py-2 rounded-md text-base font-medium w-full text-left ${
                  currentPage === 'home' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
                }`}
              >
                Home
              </button>
              <button 
                onClick={() => { setCurrentPage('products'); setIsMenuOpen(false); }}
                className={`block px-3 py-2 rounded-md text-base font-medium w-full text-left ${
                  currentPage === 'products' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
                }`}
              >
                Products
              </button>
              <button 
                onClick={() => { setCurrentPage('brands'); setIsMenuOpen(false); }}
                className={`block px-3 py-2 rounded-md text-base font-medium w-full text-left ${
                  currentPage === 'brands' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
                }`}
              >
                Brands
              </button>
              <button 
                onClick={() => { setCurrentPage('inquiry'); setIsMenuOpen(false); }}
                className="bg-blue-600 text-white px-3 py-2 rounded-md text-base font-medium hover:bg-blue-700 transition-colors w-full text-left"
              >
                B2B Inquiry
              </button>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

// Hero Section
const HeroSection = () => {
  return (
    <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Premium Sports Equipment
            <span className="block text-blue-200">for GCC Region</span>
          </h1>
          <p className="text-xl md:text-2xl mb-8 text-blue-100 max-w-3xl mx-auto">
            Your trusted partner for GOWIN footwear, TRIUMPH equipment, BABBLER fitness gear, and CAPTAIN sports accessories. 
            Serving wholesale and retail customers across the Gulf region.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-white text-blue-900 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-50 transition-colors">
              View Catalog
            </button>
            <button className="border-2 border-white text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-white hover:text-blue-900 transition-colors">
              B2B Partnership
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Brands Showcase
const BrandsShowcase = () => {
  const brands = [
    {
      name: 'GOWIN',
      description: 'Premium Sports Footwear',
      categories: 'Cricket • Football • Badminton • Running',
      color: 'from-green-600 to-green-800'
    },
    {
      name: 'TRIUMPH',
      description: 'Complete Sports Equipment',
      categories: 'Cricket Bags • Accessories • Equipment',
      color: 'from-red-600 to-red-800'
    },
    {
      name: 'BABBLER',
      description: 'Professional Fitness Gear',
      categories: 'Gym Equipment • Support Gear • Boxing',
      color: 'from-purple-600 to-purple-800'
    },
    {
      name: 'CAPTAIN',
      description: 'Sports Accessories & Protective Gear',
      categories: 'Soccer Socks • Shin Guards • Protective Gear',
      color: 'from-orange-600 to-orange-800'
    }
  ];

  return (
    <div className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Our Premium Brands</h2>
          <p className="text-xl text-gray-600">Trusted by athletes and sports professionals worldwide</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {brands.map((brand, index) => (
            <div key={index} className="group cursor-pointer">
              <div className={`bg-gradient-to-br ${brand.color} p-8 rounded-2xl text-white transform group-hover:scale-105 transition-all duration-300 shadow-lg group-hover:shadow-2xl`}>
                <h3 className="text-3xl font-bold mb-4">{brand.name}</h3>
                <p className="text-lg mb-4 text-blue-100">{brand.description}</p>
                <p className="text-sm opacity-90">{brand.categories}</p>
                <div className="mt-6 flex justify-between items-center">
                  <span className="text-sm font-medium">View Products</span>
                  <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Featured Products Component
const FeaturedProducts = ({ featuredProducts }) => {
  return (
    <div className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Featured Products</h2>
          <p className="text-xl text-gray-600">Discover our most popular sports equipment</p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {featuredProducts.map((product, index) => (
            <div key={product.id || index} className="bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden group">
              <div className="aspect-w-1 aspect-h-1 bg-gray-200 p-4">
                <div className="w-full h-48 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center">
                  <span className="text-gray-400 text-sm">{product.brand}</span>
                </div>
              </div>
              <div className="p-6">
                <div className="flex justify-between items-start mb-2">
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    product.brand === 'GOWIN' ? 'bg-green-100 text-green-800' :
                    product.brand === 'TRIUMPH' ? 'bg-red-100 text-red-800' :
                    'bg-purple-100 text-purple-800'
                  }`}>
                    {product.brand}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {product.name}
                </h3>
                <p className="text-sm text-gray-600 mb-4">{product.category}</p>
                <button className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                  Request Quote
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Products Page Component
const ProductsPage = ({ products, setProducts }) => {
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const categories = {
    'GOWIN': ['Cricket Shoes', 'Football Shoes', 'Badminton Shoes', 'Running Shoes', 'Footwear Accessories'],
    'TRIUMPH': ['Cricket Bags', 'Cricket Accessories', 'Badminton Equipment', 'Sports Bags', 'General Accessories'],
    'BABBLER': ['Gym Gloves', 'Gym Belts', 'Support Gear', 'Boxing Equipment', 'Fitness Accessories'],
    'CAPTAIN': ['Soccer Socks', 'Sports Socks', 'Shin Guards', 'Protective Gear', 'Sports Tape', 'Jump Ropes', 'Water Bottles', 'Captain Bands', 'Casual Socks']
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBrand) params.append('brand', selectedBrand);
      if (selectedCategory) params.append('category', selectedCategory);
      if (searchTerm) params.append('search', searchTerm);
      
      const response = await axios.get(`${API}/products?${params.toString()}`);
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [selectedBrand, selectedCategory, searchTerm]);

  const filteredCategories = selectedBrand ? categories[selectedBrand] || [] : [];

  return (
    <div className="py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Product Catalog</h1>
          
          {/* Filters */}
          <div className="bg-white p-6 rounded-lg shadow-md mb-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                <input
                  type="text"
                  placeholder="Search products..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Brand</label>
                <select 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedBrand}
                  onChange={(e) => {
                    setSelectedBrand(e.target.value);
                    setSelectedCategory(''); // Reset category when brand changes
                  }}
                >
                  <option value="">All Brands</option>
                  <option value="GOWIN">GOWIN</option>
                  <option value="TRIUMPH">TRIUMPH</option>
                  <option value="BABBLER">BABBLER</option>
                  <option value="CAPTAIN">CAPTAIN</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  disabled={!selectedBrand}
                >
                  <option value="">All Categories</option>
                  {filteredCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button 
                  onClick={() => {
                    setSelectedBrand('');
                    setSelectedCategory('');
                    setSearchTerm('');
                  }}
                  className="w-full bg-gray-500 text-white py-2 px-4 rounded-md hover:bg-gray-600 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Products Grid */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Loading products...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((product, index) => (
                <div key={product.id || index} className="bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden">
                  <div className="aspect-w-1 aspect-h-1 bg-gray-200 p-4">
                    <div className="w-full h-48 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center">
                      <span className="text-gray-400 text-sm">{product.brand}</span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        product.brand === 'GOWIN' ? 'bg-green-100 text-green-800' :
                        product.brand === 'TRIUMPH' ? 'bg-red-100 text-red-800' :
                        product.brand === 'BABBLER' ? 'bg-purple-100 text-purple-800' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        {product.brand}
                      </span>
                      {product.model_code && (
                        <span className="text-xs text-gray-500">{product.model_code}</span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{product.name}</h3>
                    <p className="text-sm text-gray-600 mb-2">{product.category}</p>
                    {product.colors && product.colors.length > 0 && (
                      <p className="text-xs text-gray-500 mb-3">Colors: {product.colors.join(', ')}</p>
                    )}
                    <button className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                      Request Quote
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {products.length === 0 && !loading && (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No products found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// B2B Inquiry Form Component
const InquiryForm = () => {
  const [formData, setFormData] = useState({
    company_name: '',
    contact_person: '',
    email: '',
    phone: '',
    country: '',
    message: '',
    inquiry_type: 'general'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await axios.post(`${API}/inquiries`, formData);
      setIsSuccess(true);
      setFormData({
        company_name: '',
        contact_person: '',
        email: '',
        phone: '',
        country: '',
        message: '',
        inquiry_type: 'general'
      });
    } catch (error) {
      console.error('Error submitting inquiry:', error);
      alert('Error submitting inquiry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  if (isSuccess) {
    return (
      <div className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
            <div className="text-green-600 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-green-900 mb-4">Inquiry Submitted Successfully!</h2>
            <p className="text-green-700 mb-6">
              Thank you for your interest in our products. We'll review your inquiry and get back to you within 24 hours.
            </p>
            <button 
              onClick={() => setIsSuccess(false)}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
            >
              Submit Another Inquiry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">B2B Partnership Inquiry</h1>
          <p className="text-xl text-gray-600">
            Interested in wholesale or distribution? Get in touch with us for bulk orders and partnership opportunities.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name *
                </label>
                <input
                  type="text"
                  name="company_name"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={formData.company_name}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Person *
                </label>
                <input
                  type="text"
                  name="contact_person"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={formData.contact_person}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  name="phone"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Country *
                </label>
                <input
                  type="text"
                  name="country"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={formData.country}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Inquiry Type
                </label>
                <select
                  name="inquiry_type"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={formData.inquiry_type}
                  onChange={handleChange}
                >
                  <option value="general">General Inquiry</option>
                  <option value="bulk_order">Bulk Order</option>
                  <option value="quotation">Request Quotation</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Message *
              </label>
              <textarea
                name="message"
                required
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Please describe your requirements, quantity needed, and any specific products you're interested in..."
                value={formData.message}
                onChange={handleChange}
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Inquiry'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Brands Page Component
const BrandsPage = () => {
  const brands = [
    {
      name: 'GOWIN',
      description: 'Premium Sports Footwear Excellence',
      fullDescription: 'GOWIN represents the pinnacle of sports footwear innovation, offering premium quality shoes for cricket, football, badminton, and running. Each pair is crafted with precision engineering to provide maximum comfort, durability, and performance.',
      categories: [
        'Cricket Shoes - Professional grade with superior grip and comfort',
        'Football Shoes - Engineered for optimal performance on all surfaces',
        'Badminton Shoes - Lightweight design for quick court movements',
        'Running Shoes - Advanced cushioning for long-distance comfort',
        'Footwear Accessories - Socks, laces, and maintenance products'
      ],
      color: 'from-green-600 to-green-800',
      highlights: ['Premium Materials', 'Advanced Technology', 'Professional Grade']
    },
    {
      name: 'TRIUMPH',
      description: 'Complete Sports Equipment Solutions',
      fullDescription: 'TRIUMPH delivers comprehensive sports equipment solutions with an extensive range of cricket bags, accessories, and sporting goods. From professional cricket gear to recreational equipment, TRIUMPH ensures quality and reliability.',
      categories: [
        'Cricket Bags - Wheel bags, kit bags, and protective covers',
        'Cricket Accessories - Helmets, protective gear, and equipment',
        'Badminton Equipment - Rackets, shuttlecocks, and court accessories',
        'Sports Bags - Multi-purpose bags for various sports',
        'General Accessories - Training equipment and sporting goods'
      ],
      color: 'from-red-600 to-red-800',
      highlights: ['Comprehensive Range', 'Professional Quality', 'Durable Construction']
    },
    {
      name: 'BABBLER',
      description: 'Professional Fitness & Athletic Gear',
      fullDescription: 'BABBLER specializes in professional-grade fitness and athletic support equipment. From gym gloves to comprehensive support gear, BABBLER products are designed for serious athletes and fitness enthusiasts.',
      categories: [
        'Gym Gloves - Premium leather and synthetic options',
        'Gym Belts - Professional weight lifting support',
        'Support Gear - Compression supports for joints and muscles',
        'Boxing Equipment - Punching bags, gloves, and protective gear',
        'Fitness Accessories - Training aids and workout equipment'
      ],
      color: 'from-purple-600 to-purple-800',
      highlights: ['Athletic Performance', 'Support Technology', 'Professional Grade']
    }
  ];

  return (
    <div className="py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Our Premium Brands</h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            We are the exclusive distributors for three world-class sports equipment brands in the GCC region. 
            Each brand represents excellence in its category, serving professional athletes and sports enthusiasts.
          </p>
        </div>

        <div className="space-y-16">
          {brands.map((brand, index) => (
            <div key={index} className={`${index % 2 === 1 ? 'lg:flex-row-reverse' : ''} lg:flex lg:items-center lg:space-x-12 space-y-8 lg:space-y-0`}>
              <div className="lg:w-1/2">
                <div className={`bg-gradient-to-br ${brand.color} p-12 rounded-2xl text-white`}>
                  <h2 className="text-5xl font-bold mb-6">{brand.name}</h2>
                  <p className="text-2xl mb-8 text-blue-100">{brand.description}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {brand.highlights.map((highlight, i) => (
                      <div key={i} className="bg-white bg-opacity-20 rounded-lg p-4 text-center">
                        <span className="text-sm font-semibold">{highlight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="lg:w-1/2 space-y-6">
                <h3 className="text-2xl font-bold text-gray-900">Product Categories</h3>
                <p className="text-gray-600 text-lg leading-relaxed">{brand.fullDescription}</p>
                
                <div className="space-y-4">
                  {brand.categories.map((category, i) => (
                    <div key={i} className="flex items-start space-x-3">
                      <div className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-3"></div>
                      <p className="text-gray-700">{category}</p>
                    </div>
                  ))}
                </div>
                
                <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                  View {brand.name} Products
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Footer Component
const Footer = () => {
  return (
    <footer className="bg-gray-900 text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-2">
            <h3 className="text-2xl font-bold mb-4">AKAZ SPORTS HUB</h3>
            <p className="text-gray-300 mb-4">
              Your trusted partner for premium sports equipment in the GCC region. 
              We distribute world-class brands including GOWIN, TRIUMPH, and BABBLER.
            </p>
            <div className="space-y-2 text-sm text-gray-300">
              <p>📧 akazsportshub@akazsportshub.com</p>
              <p>🌐 www.akazsportshub.com</p>
              <p>📱 0097430016557</p>
            </div>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4">Our Brands</h4>
            <ul className="space-y-2 text-gray-300">
              <li>GOWIN - Sports Footwear</li>
              <li>TRIUMPH - Sports Equipment</li>
              <li>BABBLER - Fitness Gear</li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4">Services</h4>
            <ul className="space-y-2 text-gray-300">
              <li>B2B Wholesale</li>
              <li>Bulk Orders</li>
              <li>Distribution</li>
              <li>Customer Support</li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
          <p>&copy; 2025 Akaz Sports Hub. All rights reserved. | Premium Sports Equipment Distributor for GCC Region</p>
        </div>
      </div>
    </footer>
  );
};

// Main App Component
const HomePage = ({ featuredProducts }) => {
  return (
    <div>
      <HeroSection />
      <BrandsShowcase />
      <FeaturedProducts featuredProducts={featuredProducts} />
    </div>
  );
};

function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFeaturedProducts = async () => {
    try {
      const response = await axios.get(`${API}/featured-products`);
      setFeaturedProducts(response.data);
    } catch (error) {
      console.error('Error fetching featured products:', error);
      // Set sample data if API fails
      setFeaturedProducts([
        { id: '1', name: 'NITRO Cricket Shoes', brand: 'GOWIN', category: 'Cricket Shoes' },
        { id: '2', name: 'HULK Cricket Bag', brand: 'TRIUMPH', category: 'Cricket Bags' },
        { id: '3', name: 'MITSUKO Gym Gloves', brand: 'BABBLER', category: 'Gym Gloves' },
        { id: '4', name: 'META Football Shoes', brand: 'GOWIN', category: 'Football Shoes' }
      ]);
    }
  };

  const fetchAllProducts = async () => {
    try {
      const response = await axios.get(`${API}/products`);
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
      setProducts([]);
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      setLoading(true);
      await Promise.all([fetchFeaturedProducts(), fetchAllProducts()]);
      setLoading(false);
    };
    
    initializeApp();
  }, []);

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage featuredProducts={featuredProducts} />;
      case 'products':
        return <ProductsPage products={products} setProducts={setProducts} />;
      case 'brands':
        return <BrandsPage />;
      case 'inquiry':
        return <InquiryForm />;
      default:
        return <HomePage featuredProducts={featuredProducts} />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mb-4"></div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">AKAZ SPORTS HUB</h2>
          <p className="text-gray-600">Loading premium sports equipment...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Header currentPage={currentPage} setCurrentPage={setCurrentPage} />
        <main>
          {renderCurrentPage()}
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;